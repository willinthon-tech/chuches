const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const pool = mysql.createPool({ 
    host: 'localhost', 
    user: 'root', 
    password: '$0p0rt3R0y', 
    database: 'chuches' 
});
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({error: "Faltan credenciales"});
        const [users] = await pool.query("SELECT id, username, name, rol FROM usuarios WHERE username=? AND password=?", [username, password]);
        if(!users.length) return res.status(401).json({error: "Credenciales incorrectas"});
        const user = users[0];
        const [salas] = await pool.query("SELECT sala_id FROM usuario_salas WHERE usuario_id=?", [user.id]);
        user.salasAsignadas = salas.map(s => s.sala_id);
        res.json(user);
    } catch(error) {
        console.error("Error en login:", error);
        res.status(500).json({error: "Error interno del servidor"});
    }
});
app.get('/api/sync/:sala_id', async (req, res) => {
    try {
        const sid = req.params.sala_id;
        const [info] = await pool.query("SELECT * FROM salas WHERE id=?", [sid]);
        const [turnos] = await pool.query("SELECT * FROM turnos WHERE sala_id=?", [sid]);
        const [metodos] = await pool.query("SELECT * FROM metodos_pago WHERE sala_id=?", [sid]);
        const [articulos] = await pool.query("SELECT * FROM articulos WHERE sala_id=?", [sid]);
        const [clientes] = await pool.query("SELECT * FROM clientes WHERE sala_id=?", [sid]);
        const [ventas] = await pool.query("SELECT * FROM ventas WHERE sala_id=?", [sid]);
        const [abonos] = await pool.query("SELECT * FROM abonos WHERE sala_id=?", [sid]);
        turnos.forEach(t => t.nocturno = t.nocturno === 1 || t.nocturno === true);
        ventas.forEach(v => {
            if(typeof v.articulos === 'string') {
                try { v.articulos = JSON.parse(v.articulos); } catch(e) { v.articulos = []; }
            }
        });
        res.json({ info: info[0], turnos, metodos, articulos, clientes, ventas, abonos });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/admin', async (req, res) => {
    try {
        const [salas] = await pool.query("SELECT * FROM salas");
        const [supervisores] = await pool.query("SELECT id, username, name, rol FROM usuarios");
        for (let sup of supervisores) {
            const [asig] = await pool.query("SELECT sala_id FROM usuario_salas WHERE usuario_id=?", [sup.id]);
            sup.salasAsignadas = asig.map(a => a.sala_id);
        }
        res.json({ salas, supervisores });
    } catch(error) {
        res.status(500).json({ error: error.message });
    }
});
// CREAR VENTA (POS)
app.post('/api/ventas', async (req, res) => {
    const v = req.body;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        
        await conn.query("INSERT INTO ventas (id, sala_id, turno_id, cajero, cliente, cliente_id, mod_pago, tasa, usd, ves, fecha, articulos) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", 
            [v.id, v.sala_id, v.turno_id, v.cajero, v.cliente, v.cliente_id, v.mod_pago, v.tasa, v.usd, v.ves, v.fecha, JSON.stringify(v.articulos)]);
        
        for(let art of v.articulos) {
            let cantidad = art.cant || art.cantidad;
            await conn.query("UPDATE articulos SET stock = stock - ? WHERE id = ?", [cantidad, art.id]);
        }
        
        // CORRECCIÓN: Solo sumar deuda si el método de pago es realmente a crédito o fiado
        const metodoLower = v.mod_pago.toLowerCase();
        const esDeuda = metodoLower.includes('crédito') || metodoLower.includes('credito') || metodoLower.includes('fiado');
        
        if(v.cliente_id && v.cliente_id !== 0 && esDeuda) {
            await conn.query("UPDATE clientes SET debt_usd = debt_usd + ? WHERE id = ?", [v.usd, v.cliente_id]);
        }
        
        await conn.commit();
        res.json({ success: true });
    } catch(err) {
        await conn.rollback();
        res.status(500).json({error: err.message});
    } finally { 
        conn.release(); 
    }
});
app.post('/api/abonar', async (req, res) => {
    const a = req.body;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        // 1. Restar la deuda global del cliente
        await conn.query("UPDATE clientes SET debt_usd = debt_usd - ? WHERE id = ?", [a.monto, a.cliente_id]);
        
        // 2. Guardar el abono vinculado AL TICKET específico, con método y tasa
        await conn.query("INSERT INTO abonos (sala_id, cliente_id, venta_id, cajero, fecha, monto, metodo_pago, tasa) VALUES (?,?,?,?,?,?,?,?)", 
            [a.sala_id, a.cliente_id, a.venta_id, a.cajero, a.fecha, a.monto, a.metodo, a.tasa]);
        
        await conn.commit();
        res.json({ success: true });
    } catch(err) { 
        await conn.rollback();
        res.status(500).json({error: err.message}); 
    } finally {
        conn.release();
    }
});
app.post('/api/turnos', async (req, res) => { try { await pool.query("INSERT INTO turnos (sala_id, name, inicio, fin, nocturno) VALUES (?,?,?,?,?)", [req.body.sala_id, req.body.name, req.body.inicio, req.body.fin, req.body.nocturno]); res.json({success:true}); } catch(e){ res.status(500).json({error:e.message}); } });
app.put('/api/turnos/:id', async (req, res) => { try { await pool.query("UPDATE turnos SET name=?, inicio=?, fin=?, nocturno=? WHERE id=?", [req.body.name, req.body.inicio, req.body.fin, req.body.nocturno, req.params.id]); res.json({success:true}); } catch(e){ res.status(500).json({error:e.message}); } });
app.delete('/api/turnos/:id', async (req, res) => { try { await pool.query("DELETE FROM turnos WHERE id=?", [req.params.id]); res.json({success:true}); } catch(e){ res.status(500).json({error:e.message}); } });
app.post('/api/metodos_pago', async (req, res) => { try { await pool.query("INSERT INTO metodos_pago (sala_id, name, moneda) VALUES (?,?,?)", [req.body.sala_id, req.body.name, req.body.moneda]); res.json({success:true}); } catch(e){ res.status(500).json({error:e.message}); } });
app.put('/api/metodos_pago/:id', async (req, res) => { try { await pool.query("UPDATE metodos_pago SET name=?, moneda=? WHERE id=?", [req.body.name, req.body.moneda, req.params.id]); res.json({success:true}); } catch(e){ res.status(500).json({error:e.message}); } });
app.delete('/api/metodos_pago/:id', async (req, res) => { try { await pool.query("DELETE FROM metodos_pago WHERE id=?", [req.params.id]); res.json({success:true}); } catch(e){ res.status(500).json({error:e.message}); } });
app.post('/api/salas', async (req, res) => { try { await pool.query("INSERT INTO salas (name, tasa, default_credit_limit, activa) VALUES (?,?,?,1)", [req.body.name, req.body.tasa, req.body.default_credit_limit]); res.json({success:true}); } catch(e){ res.status(500).json({error:e.message}); } });
app.put('/api/salas/:id', async (req, res) => { try { await pool.query("UPDATE salas SET name=? WHERE id=?", [req.body.name, req.params.id]); res.json({success:true}); } catch(e){ res.status(500).json({error:e.message}); } });
app.delete('/api/salas/:id', async (req, res) => { try { await pool.query("DELETE FROM salas WHERE id=?", [req.params.id]); res.json({success:true}); } catch(e){ res.status(500).json({error:e.message}); } });
app.post('/api/supervisores', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [result] = await conn.query("INSERT INTO usuarios (username, password, name, rol) VALUES (?,?,?,?)", [req.body.username, req.body.password, req.body.name, req.body.rol]);
        const userId = result.insertId;
        for(let salaId of req.body.salasAsignadas) { await conn.query("INSERT INTO usuario_salas (usuario_id, sala_id) VALUES (?,?)", [userId, salaId]); }
        await conn.commit(); res.json({success:true});
    } catch(e) { await conn.rollback(); res.status(500).json({error:e.message}); } finally { conn.release(); }
});
app.put('/api/supervisores/:id', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        if (req.body.password) { await conn.query("UPDATE usuarios SET username=?, password=?, name=?, rol=? WHERE id=?", [req.body.username, req.body.password, req.body.name, req.body.rol, req.params.id]); } 
        else { await conn.query("UPDATE usuarios SET username=?, name=?, rol=? WHERE id=?", [req.body.username, req.body.name, req.body.rol, req.params.id]); }
        await conn.query("DELETE FROM usuario_salas WHERE usuario_id=?", [req.params.id]);
        for(let salaId of req.body.salasAsignadas) { await conn.query("INSERT INTO usuario_salas (usuario_id, sala_id) VALUES (?,?)", [req.params.id, salaId]); }
        await conn.commit(); res.json({success:true});
    } catch(e) { await conn.rollback(); res.status(500).json({error:e.message}); } finally { conn.release(); }
});
app.delete('/api/supervisores/:id', async (req, res) => { try { await pool.query("DELETE FROM usuarios WHERE id=?", [req.params.id]); res.json({success:true}); } catch(e){ res.status(500).json({error:e.message}); } });
app.post('/api/articulos', async (req, res) => {
    const a = req.body;
    try {
        await pool.query("INSERT INTO articulos (sala_id, code, name, price_usd, stock) VALUES (?,?,?,?,?)", [a.sala_id, a.code, a.name, a.price_usd, a.stock]);
        res.json({success: true});
    } catch(err) { res.status(500).json({error: err.message}); }
});
app.put('/api/articulos/:id/stock', async (req, res) => {
    try {
        await pool.query("UPDATE articulos SET stock=? WHERE id=?", [req.body.stock, req.params.id]);
        res.json({success: true});
    } catch(err) { res.status(500).json({error: err.message}); }
});
app.delete('/api/articulos/:id', async (req, res) => {
    try {
        await pool.query("DELETE FROM articulos WHERE id=?", [req.params.id]);
        res.json({success: true});
    } catch(err) { res.status(500).json({error: err.message}); }
});
app.post('/api/clientes', async (req, res) => {
    const c = req.body;
    try {
        await pool.query("INSERT INTO clientes (sala_id, name, limit_usd, debt_usd) VALUES (?,?,?,0)", [c.sala_id, c.name, c.limit_usd]);
        res.json({success: true});
    } catch(err) { res.status(500).json({error: err.message}); }
});
app.put('/api/clientes/:id', async (req, res) => {
    try {
        await pool.query("UPDATE clientes SET name=?, limit_usd=? WHERE id=?", [req.body.name, req.body.limit_usd, req.params.id]);
        res.json({success: true});
    } catch(err) { res.status(500).json({error: err.message}); }
});
app.delete('/api/clientes/:id', async (req, res) => {
    try {
        await pool.query("DELETE FROM clientes WHERE id=?", [req.params.id]);
        res.json({success: true});
    } catch(err) { res.status(500).json({error: err.message}); }
});
app.put('/api/salas/:id/tasa', async (req, res) => { 
    try { await pool.query("UPDATE salas SET tasa=? WHERE id=?", [req.body.tasa, req.params.id]); res.json({success:true}); } 
    catch(err) { res.status(500).json({error: err.message}); }
});
app.put('/api/salas/:id/credito', async (req, res) => { 
    try { await pool.query("UPDATE salas SET default_credit_limit=? WHERE id=?", [req.body.limite, req.params.id]); res.json({success:true}); } 
    catch(err) { res.status(500).json({error: err.message}); }
});
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`✅ Backend listo y conectado a MySQL.`);
    console.log(`🌐 Ingresa a http://localhost:${PORT} desde tu navegador.`);
});