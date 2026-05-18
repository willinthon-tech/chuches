/* ========================================================
   CONFIGURACIÓN Y ESTADO DEL SISTEMA (BACKEND EXPRESS)
======================================================== */
const API_URL = 'http://localhost:3000/api';

let usuarioAutenticadoObj = null; let salaActivaId = null; let turnoActivoId = null; let carritoPOS = [];
let estadoApp = { adminData: { salas: [], supervisores: [] }, salaActiva: { info: null, turnos: [], metodos: [], articulos: [], clientes: [], ventas: [], abonos: [] } };

let bootstrapAlertModal, bootstrapConfirmModal, bootstrapCreditoGlobalModal, bootstrapTasaModal, bootstrapAuditoriaClienteModal, bootstrapAuditoriaAbonosModal, bootstrapDetalleTurnoModal;
let modalClienteInst, modalProductoInst, modalNuevaVentaInst, modalVerItemsInst, modalEditarClienteInst, modalAjustarStockInst, modalAbonarDeudaInst, modalTurnoInst, modalMetodoPagoInst, modalSalaInst, modalSupervisorInst, modalEmpleadoInst;
let callbackEliminacionPendiente = null;

// === CEREBRO DE ORDENAMIENTO CRONOLÓGICO ===
function sortPorFechaDesc(a, b) {
    const parseDate = (str) => {
        if(!str) return 0;
        const partes = str.split(' ');
        const f = partes[0].split('-');
        const h = (partes[1] || "00:00").split(':');
        // Convierte "18-5-2026 16:36" a tiempo real para comparar
        return new Date(f[2], f[1]-1, f[0], h[0], h[1]).getTime();
    };
    return parseDate(b.fecha || b.fecha_hora) - parseDate(a.fecha || a.fecha_hora);
}

window.onload = function() {
    bootstrapAlertModal = new bootstrap.Modal(document.getElementById('modalAlertasSistema'));
    bootstrapConfirmModal = new bootstrap.Modal(document.getElementById('modalConfirmarEliminacion'));
    bootstrapCreditoGlobalModal = new bootstrap.Modal(document.getElementById('modalFijarCreditoGlobalForm'));
    bootstrapTasaModal = new bootstrap.Modal(document.getElementById('modalFijarTasaForm'));
    bootstrapAuditoriaClienteModal = new bootstrap.Modal(document.getElementById('modalAuditoriaClienteDinamica'));
    bootstrapAuditoriaAbonosModal = new bootstrap.Modal(document.getElementById('modalAuditoriaAbonos'));
    bootstrapDetalleTurnoModal = new bootstrap.Modal(document.getElementById('modalDetalleTurnoVentas'));
    modalClienteInst = new bootstrap.Modal(document.getElementById('modalAltaCliente'));
    modalProductoInst = new bootstrap.Modal(document.getElementById('modalAltaProducto'));
    modalNuevaVentaInst = new bootstrap.Modal(document.getElementById('modalNuevaVentaPOS'));
    modalVerItemsInst = new bootstrap.Modal(document.getElementById('modalVerItemsComprados'));
    modalEditarClienteInst = new bootstrap.Modal(document.getElementById('modalEditarCliente'));
    modalAjustarStockInst = new bootstrap.Modal(document.getElementById('modalAjustarStock'));
    modalAbonarDeudaInst = new bootstrap.Modal(document.getElementById('modalAbonarDeuda'));
    modalTurnoInst = new bootstrap.Modal(document.getElementById('modalAltaTurno'));
    modalMetodoPagoInst = new bootstrap.Modal(document.getElementById('modalAltaMetodoPago'));
    modalSalaInst = new bootstrap.Modal(document.getElementById('modalAltaSala'));
    modalSupervisorInst = new bootstrap.Modal(document.getElementById('modalAltaSupervisor'));
    modalEmpleadoInst = new bootstrap.Modal(document.getElementById('modalAltaEmpleado'));

    document.getElementById('btnConfirmarEliminarEjecutar').onclick = function() {
        if(callbackEliminacionPendiente) { callbackEliminacionPendiente(); callbackEliminacionPendiente = null; }
        bootstrapConfirmModal.hide();
    };
    comprobarSesionActiva();
};

function lanzarAlertaHomedeneda(titulo, mensaje, tipo='info') {
    const modalAlert = document.getElementById('modalAlertasSistema');
    modalAlert.style.zIndex = "1060"; // Forzar la modal por encima del POS (1055)
    
    document.getElementById('headerAlertaSistema').className = "modal-header text-white py-2 " + (tipo==='error'?'bg-danger':tipo==='exito'?'bg-success':'bg-dark');
    document.getElementById('iconoAlertaSistema').innerHTML = tipo==='error'?'❌':tipo==='exito'?'✅':'ℹ️';
    document.getElementById('tituloAlertaSistema').innerText = titulo;
    document.getElementById('cuerpoAlertaSistema').innerText = mensaje;
    
    bootstrapAlertModal.show();
    
    // Forzar el fondo oscuro (backdrop) para que también quede arriba
    setTimeout(() => {
        const backdrops = document.querySelectorAll('.modal-backdrop');
        if(backdrops.length > 1) { backdrops[backdrops.length - 1].style.zIndex = "1059"; }
    }, 50);
}

function solicitarConfirmacionEliminar(mensaje, accionConfirmada) { document.getElementById('mensajeConfirmarEliminacion').innerText = mensaje; callbackEliminacionPendiente = accionConfirmada; bootstrapConfirmModal.show(); }

async function fetchAPI(endpoint, method = 'GET', data = null) {
    try {
        const config = { method, headers: { 'Content-Type': 'application/json' } };
        if (data) config.body = JSON.stringify(data);
        const res = await fetch(API_URL + endpoint, config);
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Error en el servidor");
        return result;
    } catch (error) { lanzarAlertaHomedeneda("Error de Comunicación", error.message, "error"); throw error; }
}

function comprobarSesionActiva() {
    const sessionData = localStorage.getItem('chuches_session');
    
    if (sessionData) {
        try {
            const s = JSON.parse(sessionData);
            usuarioAutenticadoObj = s.user; 
            salaActivaId = s.sala; 
            turnoActivoId = s.turno;
            entrarAlDashboardFinal(true); // Entra al dashboard en silencio
            return; // Termina la función aquí para no mostrar el login
        } catch(e) { 
            localStorage.removeItem('chuches_session'); 
        }
    }
    
    // Si llega a esta línea, significa que NO hay sesión válida.
    // Encendemos la pantalla de Login manualmente.
    const modalLogin = document.getElementById('modalAuthSistema');
    modalLogin.classList.remove('d-none');
    modalLogin.classList.add('show', 'd-block');
}

async function procesarLoginInicial(e) {
    e.preventDefault();
    const username = document.getElementById('authInputUsuario').value.trim();
    const password = document.getElementById('authInputPassword').value;
    try {
        usuarioAutenticadoObj = await fetchAPI('/login', 'POST', { username, password });
        if (usuarioAutenticadoObj.rol === "ADMIN") { await entrarAlDashboardFinal(false); } 
        else {
            document.getElementById('formLoginAutenticacion').classList.add('d-none');
            document.getElementById('bloquePostLoginSeleccionSala').classList.remove('d-none');
            estadoApp.adminData = await fetchAPI('/admin'); 
            const selSala = document.getElementById('authSelectorSala'); selSala.innerHTML = "";
            usuarioAutenticadoObj.salasAsignadas.forEach(id => { const s = estadoApp.adminData.salas.find(x => x.id === id); if(s) selSala.innerHTML += `<option value="${s.id}">${s.name || s.nombre}</option>`; });
            await actualizarSelectorTurnosLogin();
        }
    } catch (err) {}
}

async function actualizarSelectorTurnosLogin() {
    const salaId = parseInt(document.getElementById('authSelectorSala').value);
    const selTurno = document.getElementById('authSelectorTurno');
    if (usuarioAutenticadoObj.rol === "EMPLEADO") {
        document.getElementById('wrapperSelectorTurnoLogin').classList.remove('d-none');
        selTurno.innerHTML = "<option value=''>Cargando turnos...</option>";
        estadoApp.salaActiva = await fetchAPI('/sync/' + salaId);
        selTurno.innerHTML = "";
        if (estadoApp.salaActiva.turnos.length === 0) selTurno.innerHTML = `<option value="">⚠️ No hay turnos creados</option>`;
        else estadoApp.salaActiva.turnos.forEach(t => selTurno.innerHTML += `<option value="${t.id}">${t.name || t.nombre} (${t.inicio || t.hora_inicio} - ${t.fin || t.hora_fin})</option>`);
    } else { document.getElementById('wrapperSelectorTurnoLogin').classList.add('d-none'); }
}

async function sincronizarSalaConBackend() { estadoApp.salaActiva = await fetchAPI('/sync/' + salaActivaId); }

async function entrarAlDashboardFinal(fromSession = false) {
    if (!fromSession) {
        if (usuarioAutenticadoObj.rol === "EMPLEADO") {
            const tSel = document.getElementById('authSelectorTurno').value;
            if (!tSel || tSel.includes("⚠️")) { lanzarAlertaHomedeneda("Acceso Denegado", "Falta turno en sucursal.", "error"); return; }
            turnoActivoId = parseInt(tSel);
        }
        if (usuarioAutenticadoObj.rol !== "ADMIN") salaActivaId = parseInt(document.getElementById('authSelectorSala').value);
        localStorage.setItem('chuches_session', JSON.stringify({ user: usuarioAutenticadoObj, sala: salaActivaId, turno: turnoActivoId }));
    }
    document.getElementById('modalAuthSistema').classList.add('d-none');
    document.getElementById('modalAuthSistema').classList.remove('show', 'd-block');
    document.getElementById('dashboardPrincipal').classList.remove('d-none');
    document.getElementById('lblUsernameMenu').innerText = `@${usuarioAutenticadoObj.username}`;
    document.getElementById('lblRolMenu').innerText = usuarioAutenticadoObj.rol;
    const menu = document.getElementById('menuNavegacionDinamico');
    if (usuarioAutenticadoObj.rol === "ADMIN") {
        estadoApp.adminData = await fetchAPI('/admin');
        document.getElementById('lblSalaActivaName').innerText = "Global Admin";
        document.getElementById('indicadoresResumenSala').classList.add('d-none');
        menu.innerHTML = `<li class="nav-item"><a class="nav-link active" onclick="navegarOperacionesA('salas')"><i class="bi bi-shop me-2"></i>Salas</a></li><li class="nav-item"><a class="nav-link" onclick="navegarOperacionesA('supervisores')"><i class="bi bi-people me-2"></i>Encargados</a></li>`;
        navegarOperacionesA('salas');
    } else {
        await sincronizarSalaConBackend();
        if (usuarioAutenticadoObj.rol === "SUPERVISOR") estadoApp.adminData = await fetchAPI('/admin');
        document.getElementById('lblSalaActivaName').innerText = estadoApp.salaActiva.info.name || estadoApp.salaActiva.info.nombre;
        document.getElementById('indicadoresResumenSala').classList.remove('d-none');
        const badge = document.getElementById('lblTurnoActivoBadgeContainer');
        if (turnoActivoId) { const t = estadoApp.salaActiva.turnos.find(t => t.id === turnoActivoId); if(t) badge.innerHTML = `<span class="badge bg-danger mt-1">${t.name || t.nombre}</span>`; }
        let itemsMenu = '';
        if (usuarioAutenticadoObj.rol === "EMPLEADO") {
            document.getElementById('wrapperBtnCambiarTasa').innerHTML = ""; document.getElementById('wrapperBtnCambiarCreditoGlobal').innerHTML = "";
            itemsMenu += `<li class="nav-item"><a class="nav-link active" onclick="navegarOperacionesA('ventasEmpleadoCajero')"><i class="bi bi-receipt-cutoff me-2"></i>Mis Ventas</a></li><li class="nav-item"><a class="nav-link" onclick="navegarOperacionesA('clientesGestion')"><i class="bi bi-person-gear me-2"></i>Clientes</a></li>`;
            navegarOperacionesA('ventasEmpleadoCajero');
        } else if (usuarioAutenticadoObj.rol === "SUPERVISOR") {
            document.getElementById('wrapperBtnCambiarTasa').innerHTML = `<button class="btn btn-sm btn-outline-success py-0 px-2 fw-bold" onclick="abrirModalModificarTasa()"><i class="bi bi-pencil-square"></i></button>`;
            document.getElementById('wrapperBtnCambiarCreditoGlobal').innerHTML = `<button class="btn btn-sm btn-outline-warning py-0 px-2 fw-bold" onclick="abrirModalModificarCreditoGlobal()"><i class="bi bi-pencil-square"></i> Ajustar</button>`;
            
            // AQUÍ AGREGAMOS EL DASHBOARD DE PRIMERO
            itemsMenu += `<li class="nav-item"><a class="nav-link active" onclick="navegarOperacionesA('supervisorDashboard')"><i class="bi bi-bar-chart-fill me-2"></i>Estadísticas</a></li>`;
            
            itemsMenu += `<li class="nav-item"><a class="nav-link" onclick="navegarOperacionesA('ventasAuditoria')"><i class="bi bi-journal-check me-2"></i>Auditoría</a></li><li class="nav-item"><a class="nav-link" onclick="navegarOperacionesA('clientesGestion')"><i class="bi bi-person-gear me-2"></i>Clientes</a></li><li class="nav-item"><a class="nav-link" onclick="navegarOperacionesA('inventario')"><i class="bi bi-boxes me-2"></i>Inventario</a></li><li class="nav-item"><a class="nav-link" onclick="navegarOperacionesA('supervisorEmpleados')"><i class="bi bi-people me-2"></i>Personal</a></li><li class="nav-item"><a class="nav-link" onclick="navegarOperacionesA('supervisorTurnos')"><i class="bi bi-clock-history me-2"></i>Turnos</a></li><li class="nav-item"><a class="nav-link" onclick="navegarOperacionesA('supervisorMetodosPago')"><i class="bi bi-credit-card-fill me-2"></i>Pagos</a></li>`;
            
            // Cargar Dashboard por defecto
            navegarOperacionesA('supervisorDashboard');
        }
        
        menu.innerHTML = itemsMenu; actualizarKpisYResumenSala();
    }
}

function regresarALogin() { localStorage.removeItem('chuches_session'); location.reload(); }

function navegarOperacionesA(v) {
    ['viewSupervisorDashboard', 'viewAdminSalas','viewAdminSupervisores','viewVentasAuditoria','viewVentasEmpleadoCajero','viewClientesGestion','viewInventario','viewSupervisorEmpleados','viewSupervisorTurnos','viewSupervisorMetodosPago'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).classList.add('d-none'); });
    document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active')); if(event?.currentTarget) event.currentTarget.classList.add('active');
    
    // REGLA INTELIGENTE: Ocultar KPIs de "Tasa/Crédito" si estamos en el Dashboard
    const barraKpis = document.getElementById('indicadoresResumenSala');
    if (barraKpis && usuarioAutenticadoObj.rol !== "ADMIN") {
        if (v === 'supervisorDashboard') barraKpis.classList.add('d-none');
        else barraKpis.classList.remove('d-none');
    }

    if(v==='supervisorDashboard'){ document.getElementById('viewSupervisorDashboard').classList.remove('d-none'); renderizarDashboardSupervisor(); }
    if(v==='salas'){ document.getElementById('viewAdminSalas').classList.remove('d-none'); renderizarSalasAdminTable(); }
    if(v==='supervisores'){ document.getElementById('viewAdminSupervisores').classList.remove('d-none'); renderizarSupervisoresAdminTable(); }
    if(v==='ventasAuditoria'){ document.getElementById('viewVentasAuditoria').classList.remove('d-none'); renderizarMatrizVentasAuditoria(); }
    if(v==='ventasEmpleadoCajero'){ document.getElementById('viewVentasEmpleadoCajero').classList.remove('d-none'); renderizarVentasPropiasEmpleado(); }
    if(v==='clientesGestion'){ document.getElementById('viewClientesGestion').classList.remove('d-none'); renderizarClientesSalaTable(); }
    if(v==='inventario'){ document.getElementById('viewInventario').classList.remove('d-none'); renderizarModuloInventarioGestion(); }
    if(v==='supervisorEmpleados'){ document.getElementById('viewSupervisorEmpleados').classList.remove('d-none'); renderizarEmpleadosSalaTable(); }
    if(v==='supervisorTurnos'){ document.getElementById('viewSupervisorTurnos').classList.remove('d-none'); renderizarTurnosConfigTable(); }
    if(v==='supervisorMetodosPago'){ document.getElementById('viewSupervisorMetodosPago').classList.remove('d-none'); renderizarMetodosPagoConfigTable(); }
}

function actualizarKpisYResumenSala() {
    if(!salaActivaId || !estadoApp.salaActiva.info) return;
    const s = estadoApp.salaActiva.info; const d = estadoApp.salaActiva;
    document.getElementById('lblCardTasa').innerText = parseFloat(s.tasa).toFixed(2);
    document.getElementById('lblCardLimiteCredito').innerText = parseFloat(s.default_credit_limit || s.limite_credito_defecto).toFixed(2);
    document.getElementById('lblCardArticulos').innerText = `${d.articulos.length} Items`;
    document.getElementById('lblCardDeudaTotal').innerText = d.clientes.reduce((acc, c) => acc + parseFloat(c.debt_usd || c.deuda_usd), 0).toFixed(2);
}

// ==========================================
// BUSCADOR TICKET Y FACTURA
// ==========================================
function buscarTicketGlobal(ticketId) { const v = estadoApp.salaActiva.ventas.find(t => t.id === ticketId); return v ? v : null; }
function verDetallesFactura(ticketId) {
    let tk = buscarTicketGlobal(ticketId);
    if(!tk) { lanzarAlertaHomedeneda("Error", "Ticket no encontrado.", "error"); return; }
    
    document.getElementById('invoiceTicketId').innerText = tk.id; 
    document.getElementById('invoiceFecha').innerText = tk.fecha || tk.fecha_hora; 
    document.getElementById('invoiceCajero').innerText = `@${tk.cajero || tk.cajero_username}`; 
    document.getElementById('invoiceCliente').innerText = tk.cliente;
    
    const metodoReal = tk.mod_pago || tk.metodo_pago; 
    const esCredito = metodoReal.toLowerCase().includes('crédito') || metodoReal.toLowerCase().includes('credito') || metodoReal.toLowerCase().includes('fiado');
    
    document.getElementById('invoiceMetodo').innerText = metodoReal; 
    document.getElementById('invoiceMetodo').className = esCredito ? 'badge bg-warning text-dark' : 'badge bg-success';
    
    // MAGIA DE UX: Si es a crédito, escondemos por completo las líneas de Tasa y Bolívares
    document.getElementById('invoiceTasa').parentNode.style.display = esCredito ? 'none' : 'block';
    document.getElementById('invoiceTotalVES').parentNode.style.display = esCredito ? 'none' : 'block';
    
    if (!esCredito) {
        document.getElementById('invoiceTasa').innerText = parseFloat(tk.tasa || tk.tasa_aplicada).toFixed(2); 
        document.getElementById('invoiceTotalVES').innerText = parseFloat(tk.ves || tk.total_ves).toFixed(2);
    }
    
    document.getElementById('invoiceTotalUSD').innerText = parseFloat(tk.usd || tk.total_usd).toFixed(2); 
    
    const tbody = document.getElementById('cuerpoTablaItemsComprados'); tbody.innerHTML = "";
    const arts = typeof tk.articulos === 'string' ? JSON.parse(tk.articulos) : tk.articulos;
    arts.forEach(art => { const cant = art.cant || art.cantidad; const precio = art.price_usd || art.precioUnitario || art.precio_unitario_usd; tbody.innerHTML += `<tr><td><code>${art.code || art.codigo || ''}</code></td><td class="text-start fw-bold text-dark">${art.name || art.nombre}</td><td>${cant}</td><td>$${parseFloat(precio).toFixed(2)}</td><td class="fw-bold text-success">$${(cant * parseFloat(precio)).toFixed(2)}</td></tr>`; });
    
    if(document.getElementById('modalAuditoriaClienteDinamica').classList.contains('show')) bootstrapAuditoriaClienteModal.hide();
    modalVerItemsInst.show();
}

// ==========================================
// POS / VENTAS (EMPLEADO)
// ==========================================

// 1. MIS VENTAS (Cajero)
function renderizarVentasPropiasEmpleado() {
    const tbody = document.getElementById('cuerpoTablaVentasPropiasEmpleado'); tbody.innerHTML = "";
    const filtrados = estadoApp.salaActiva.ventas.filter(v => parseInt(v.turno_id) === turnoActivoId && (v.cajero === usuarioAutenticadoObj.username || v.cajero_username === usuarioAutenticadoObj.username));
    
    filtrados.sort(sortPorFechaDesc).forEach(v => { 
        const mod = v.mod_pago || v.metodo_pago;
        const esCredito = mod.toLowerCase().includes('crédito') || mod.toLowerCase().includes('credito') || mod.toLowerCase().includes('fiado');
        
        let tasaStr = esCredito ? '<span class="text-muted">N/A</span>' : `${parseFloat(v.tasa || v.tasa_aplicada).toFixed(2)} Bs`;
        let vesStr = esCredito ? '<span class="text-muted">N/A</span>' : `${parseFloat(v.ves || v.total_ves).toFixed(2)} Bs`;
        
        let statusBadge = `<span class="badge bg-success">Pagada</span>`;
        let btnAbonos = '';

        if (esCredito) {
            const abonosTicket = (estadoApp.salaActiva.abonos || []).filter(a => a.venta_id === v.id);
            const totalAbonado = abonosTicket.reduce((sum, a) => sum + parseFloat(a.monto || a.monto_usd), 0);
            const deuda = parseFloat(v.usd || v.total_usd) - totalAbonado;
            
            statusBadge = deuda > 0 ? `<span class="badge bg-danger">Debe $${deuda.toFixed(2)}</span>` : `<span class="badge bg-success">Pagada</span>`;
            btnAbonos = `<button class="btn btn-sm btn-secondary py-0 px-2 fw-bold ms-1" onclick="abrirAuditoriaAbonosCliente('${v.id}')" title="Ver Abonos"><i class="bi bi-list-check"></i> Abonos</button>`;
        }

        tbody.innerHTML += `<tr><td><code>${v.id}</code></td><td><small>${v.fecha || v.fecha_hora}</small></td><td>${v.cliente}</td><td><span class="badge ${esCredito ? 'bg-warning text-dark' : 'bg-secondary'}">${mod}</span></td><td>${tasaStr}</td><td class="fw-bold text-success">$${parseFloat(v.usd || v.total_usd).toFixed(2)}</td><td class="text-muted">${vesStr}</td><td>${statusBadge}</td><td><div class="d-flex justify-content-center align-items-center"><button class="btn btn-sm btn-primary py-0 px-2 fw-bold" onclick="verDetallesFactura('${v.id}')"><i class="bi bi-receipt"></i> Detalles</button>${btnAbonos}</div></td></tr>`; 
    });
}

function abrirModalNuevaVentaCajero() {
    carritoPOS = []; 
    document.getElementById('posTotalUSD').innerText = "0.00"; 
    document.getElementById('posConversionLabelBs').innerText = "Equivalente: 0.00 Bs"; 
    document.getElementById('posCarritoCuerpo').innerHTML = "";
    
    // Configurar Interruptor a Venta Normal por defecto
    const sw = document.getElementById('posSwitchTipoVenta');
    if(sw) { sw.checked = false; toggleTipoVentaPOS(); }
    
    // Poblar Clientes
    const cSel = document.getElementById('posSelectCliente'); 
    cSel.innerHTML = "<option value='0' disabled selected>-- Seleccione un Cliente --</option>"; 
    estadoApp.salaActiva.clientes.forEach(c => cSel.innerHTML += `<option value="${c.id}">${c.name || c.nombre} (Deuda Actual: $${parseFloat(c.debt_usd || c.deuda_usd).toFixed(2)})</option>`);
    
    // Poblar Métodos
    const mSel = document.getElementById('posSelectMetodo'); 
    mSel.innerHTML = ""; 
    estadoApp.salaActiva.metodos.forEach(m => mSel.innerHTML += `<option value="${m.name || m.nombre}">${m.name || m.nombre} (${m.moneda})</option>`);
    
    // Poblar Productos Inteligentes (Bloquea los de Stock 0)
    const grid = document.getElementById('gridProductosVenta'); 
    grid.innerHTML = ""; 
    estadoApp.salaActiva.articulos.forEach(art => { 
        const sinStock = art.stock <= 0;
        const claseCss = sinStock ? "product-card out-of-stock" : "product-card";
        const eventoClick = sinStock ? "" : `onclick="agregarAlCarritoPOS(${art.id})"`;
        
        grid.innerHTML += `<div class="${claseCss}" ${eventoClick}><code class="d-block small text-secondary">${art.code || art.codigo}</code><strong style="font-size:0.8rem;" class="d-block text-truncate">${art.name || art.nombre}</strong><span class="badge bg-primary mt-1">$${parseFloat(art.price_usd || art.precio_usd).toFixed(2)}</span><small class="d-block ${sinStock ? 'text-danger fw-bold' : 'text-muted'} mt-1" style="font-size:0.7rem;">Stock: ${art.stock}</small></div>`; 
    });
    
    actualizarEstadoBotonVenta(); 
    modalNuevaVentaInst.show();
}

function toggleTipoVentaPOS() {
    const isCredito = document.getElementById('posSwitchTipoVenta').checked;
    const lbl = document.getElementById('lblPosTipoVenta');
    const divCliente = document.getElementById('divPosCliente');
    const divMetodo = document.getElementById('divPosMetodo');

    if (isCredito) {
        lbl.innerText = "Venta a Crédito (Fiado)";
        lbl.className = "form-check-label fw-bold text-danger m-0";
        divCliente.style.display = "block";
        divMetodo.style.display = "none";
        document.getElementById('posSelectCliente').value = "0"; // Reiniciar selección para obligar a elegir
    } else {
        lbl.innerText = "Venta Normal (Contado)";
        lbl.className = "form-check-label fw-bold text-dark m-0";
        divCliente.style.display = "none";
        divMetodo.style.display = "block";
    }
    actualizarEstadoBotonVenta();
}

function agregarAlCarritoPOS(artId) {
    const art = estadoApp.salaActiva.articulos.find(a => a.id === artId); 
    const existe = carritoPOS.find(c => c.id === artId);
    
    if (existe) { 
        if (existe.cantidad >= art.stock) return; // Falla en silencio, sin alertas molestas
        existe.cantidad++; 
    } else { 
        if (art.stock <= 0) return; 
        carritoPOS.push({ id: art.id, code: art.code || art.codigo, name: art.name || art.nombre, precioUnitario: parseFloat(art.price_usd || art.precio_usd), cantidad: 1 }); 
    }
    renderizarCarritoPOS();
}

function cambiarCantidadPOS(idx, delta) {
    const item = carritoPOS[idx];
    const art = estadoApp.salaActiva.articulos.find(a => a.id === item.id);
    
    if (delta === 1) {
        if (item.cantidad >= art.stock) return;
        item.cantidad++;
    } else if (delta === -1) {
        if (item.cantidad > 1) { item.cantidad--; } 
        else { carritoPOS.splice(idx, 1); }
    }
    renderizarCarritoPOS();
}

function renderizarCarritoPOS() {
    const tbody = document.getElementById('posCarritoCuerpo'); 
    tbody.innerHTML = ""; 
    let totalUsd = 0;
    
    carritoPOS.forEach((c, idx) => { 
        const sub = c.cantidad * c.precioUnitario; 
        totalUsd += sub; 
        
        // Verificar si llegamos al límite para apagar el botón +
        const artInfo = estadoApp.salaActiva.articulos.find(a => a.id === c.id);
        const maxAlcanzado = c.cantidad >= (artInfo ? artInfo.stock : 0);
        
        tbody.innerHTML += `
        <tr>
            <td class="text-start text-truncate" style="max-width:110px;"><small>${c.name}</small></td>
            <td>
                <div class="d-flex justify-content-center align-items-center">
                    <button class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold" onclick="cambiarCantidadPOS(${idx}, -1)">-</button>
                    <span class="mx-2 fw-bold">${c.cantidad}</span>
                    <button class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold" onclick="cambiarCantidadPOS(${idx}, 1)" ${maxAlcanzado ? 'disabled' : ''}>+</button>
                </div>
            </td>
            <td>$${c.precioUnitario.toFixed(2)}</td>
            <td class="fw-bold">$${sub.toFixed(2)}</td>
            <td><button class="btn btn-sm btn-danger py-0 px-2" onclick="carritoPOS.splice(${idx},1); renderizarCarritoPOS();" title="Quitar del carrito"><i class="bi bi-x"></i></button></td>
        </tr>`; 
    });
    
    document.getElementById('posTotalUSD').innerText = totalUsd.toFixed(2); 
    actualizarEstadoBotonVenta();
}

function actualizarEstadoBotonVenta() {
    const btn = document.getElementById('btnProcesarVenta'); 
    const totalUSD = parseFloat(document.getElementById('posTotalUSD').innerText); 
    const isCredito = document.getElementById('posSwitchTipoVenta').checked;
    const alerta = document.getElementById('alertaCreditoVenta'); 
    const tasa = parseFloat(estadoApp.salaActiva.info.tasa);

    // Calcular etiquetas de moneda
    if (!isCredito) {
        const metId = document.getElementById('posSelectMetodo').value; 
        const met = (estadoApp.salaActiva.metodos || []).find(m => m.name === metId || m.nombre === metId); 
        if (met && met.moneda === 'VES') {
            document.getElementById('posConversionLabelBs').innerHTML = `Total a pagar en Bs: <strong class="text-warning fs-5">${(totalUSD * tasa).toFixed(2)} Bs</strong> (Tasa: ${tasa.toFixed(2)})`;
        } else {
            document.getElementById('posConversionLabelBs').innerHTML = `Equivalente: <strong class="fs-6">${(totalUSD * tasa).toFixed(2)} Bs</strong> (Tasa: ${tasa.toFixed(2)})`;
        }
    } else {
        document.getElementById('posConversionLabelBs').innerHTML = `Deuda generada: <strong class="text-danger fs-6">${(totalUSD * tasa).toFixed(2)} Bs</strong> (Tasa: ${tasa.toFixed(2)})`;
    }

    if (totalUSD === 0 || carritoPOS.length === 0) { alerta.classList.add('d-none'); btn.disabled = true; return; }

    if (!isCredito) {
        alerta.classList.add('d-none'); 
        btn.disabled = false; 
    } else {
        const cId = parseInt(document.getElementById('posSelectCliente').value); 
        alerta.classList.remove('d-none');

        if (!cId || cId === 0 || isNaN(cId)) {
            alerta.className = "mb-2 small text-danger fw-bold"; 
            alerta.innerHTML = `<i class="bi bi-exclamation-triangle"></i> Debes seleccionar un cliente para poder fiar la mercancía.`; 
            btn.disabled = true;
            return;
        }

        const cObj = estadoApp.salaActiva.clientes.find(c => c.id === cId); 
        const disponible = parseFloat(cObj.limit_usd || cObj.limite_usd) - parseFloat(cObj.debt_usd || cObj.deuda_usd);
        
        if (disponible <= 0) { 
            alerta.className = "mb-2 small text-danger fw-bold"; 
            alerta.innerHTML = `<i class="bi bi-exclamation-triangle"></i> El cliente tiene el cupo agotado.`; 
            btn.disabled = true; 
        } else if (totalUSD > disponible) { 
            alerta.className = "mb-2 small text-danger fw-bold"; 
            alerta.innerHTML = `<i class="bi bi-exclamation-triangle"></i> La compra supera el crédito restante de $${disponible.toFixed(2)}.`; 
            btn.disabled = true; 
        } else { 
            alerta.className = "mb-2 small text-success fw-bold"; 
            alerta.innerHTML = `Límite disponible validado: $${disponible.toFixed(2)}`; 
            btn.disabled = false; 
        }
    }
}

function verificarLimiteCreditoVenta() { actualizarEstadoBotonVenta(); }

async function procesarEjecutarVentaPOS() {
    if (carritoPOS.length === 0) return;
    
    // Verificación estricta de turno
    const tObj = estadoApp.salaActiva.turnos.find(t => t.id === turnoActivoId); 
    const ahora = new Date(); 
    const minsAhora = ahora.getHours() * 60 + ahora.getMinutes();
    const tInicio = tObj.inicio || tObj.hora_inicio; 
    const tFin = tObj.fin || tObj.hora_fin; 
    const [hIni, mIni] = tInicio.split(':').map(Number); 
    const [hFin, mFin] = tFin.split(':').map(Number);
    const minsIni = hIni * 60 + mIni; const minsFin = hFin * 60 + mFin; 
    let enHorario = false;
    if (tObj.nocturno || tObj.cruza_medianoche || minsFin < minsIni) { if (minsAhora >= minsIni || minsAhora <= minsFin) enHorario = true; } else { if (minsAhora >= minsIni && minsAhora <= minsFin) enHorario = true; }
    if (!enHorario) { lanzarAlertaHomedeneda("Turno Restringido", `La hora actual no corresponde a tu turno operativo asignado (${tInicio} a ${tFin}).`, "error"); return; }

    const isCredito = document.getElementById('posSwitchTipoVenta').checked;
    const totalUSD = carritoPOS.reduce((acc, c) => acc + (c.cantidad * c.precioUnitario), 0); 
    const tasa = parseFloat(estadoApp.salaActiva.info.tasa); 
    
    let cId = null;
    let modPago = '';
    let clienteNombre = "Público General";

    if (isCredito) {
        const selectEl = document.getElementById('posSelectCliente');
        cId = parseInt(selectEl.value);
        clienteNombre = selectEl.options[selectEl.selectedIndex].text.split(' (')[0];
        modPago = 'Crédito'; // Forzamos la etiqueta para backend
    } else {
        modPago = document.getElementById('posSelectMetodo').value;
    }

    const payload = { 
        id: `REC-${Math.floor(1000 + Math.random() * 9000)}`, 
        sala_id: salaActivaId, 
        turno_id: turnoActivoId, 
        cajero: usuarioAutenticadoObj.username, 
        cliente: clienteNombre, 
        cliente_id: cId, 
        mod_pago: modPago, 
        tasa: tasa, 
        usd: totalUSD, 
        ves: totalUSD * tasa, 
        fecha: `${ahora.toLocaleDateString('es-ES').replace(/\//g, '-')} ${ahora.toTimeString().substring(0,5)}`, 
        articulos: carritoPOS 
    };

    try { 
        // Bloquear botón para evitar doble clic
        document.getElementById('btnProcesarVenta').disabled = true;
        await fetchAPI('/ventas', 'POST', payload); 
        modalNuevaVentaInst.hide(); 
        lanzarAlertaHomedeneda("Transacción Exitosa", "Factura procesada y descontada del stock.", "exito"); 
        await sincronizarSalaConBackend(); 
        renderizarVentasPropiasEmpleado(); 
        actualizarKpisYResumenSala(); 
        renderizarClientesSalaTable(); 
    } catch(err) {
        document.getElementById('btnProcesarVenta').disabled = false;
    }
}

// ==========================================
// GESTIÓN DE CLIENTES Y ABONOS (REFINADA)
// ==========================================
function renderizarClientesSalaTable() {
    const tbody = document.getElementById('tablaClientesRegistradosSala'); tbody.innerHTML = ""; let clientes = estadoApp.salaActiva.clientes || []; const esEmp = usuarioAutenticadoObj.rol === "EMPLEADO";
    const btnNuevo = document.getElementById('btnNuevoClienteTop'); if (btnNuevo) btnNuevo.style.display = esEmp ? 'none' : 'inline-block';
    if(clientes.length === 0) { tbody.innerHTML = `<tr><td colspan="6" class="text-muted p-3">No hay clientes.</td></tr>`; return; }
    
    clientes.sort((a, b) => parseFloat(b.debt_usd || b.deuda_usd) - parseFloat(a.debt_usd || a.deuda_usd));
    
    clientes.forEach(c => {
        const dDeuda = parseFloat(c.debt_usd || c.deuda_usd); const dLim = parseFloat(c.limit_usd || c.limite_usd); const tieneDeuda = dDeuda > 0; 
        
        let botones = '';
        if (!esEmp) botones += `<button class="btn btn-sm btn-primary px-2 fw-bold" onclick="abrirModalEditarCliente(${c.id})" title="Editar Cliente"><i class="bi bi-pencil-fill"></i></button>`;
        
        botones += `<button class="btn btn-sm btn-info text-white px-2 fw-bold ms-1" onclick="abrirAuditoriaHistorialCliente(${c.id}, '${c.name || c.nombre}')" title="Ver Movimientos"><i class="bi bi-clock-history"></i> Movimientos</button>`;
        
        // REGLA DE NEGOCIO: Supervisor no puede borrar si hay deuda
        if (!esEmp) {
            if (tieneDeuda) {
                botones += `<button class="btn btn-sm btn-outline-secondary px-2 fw-bold ms-1" disabled title="Bloqueado: El cliente tiene una deuda activa"><i class="bi bi-trash3-fill"></i></button>`;
            } else {
                botones += `<button class="btn btn-sm btn-outline-danger px-2 fw-bold ms-1" onclick="eliminarClienteSalaConModal(${c.id}, '${c.name || c.nombre}')" title="Eliminar"><i class="bi bi-trash3-fill"></i></button>`;
            }
        }
        
        tbody.innerHTML += `<tr ${tieneDeuda?'class="fila-deudor"':''}><td><strong>${c.id}</strong></td><td class="text-start">${c.name || c.nombre}</td><td class="text-primary fw-bold">$${dLim.toFixed(2)}</td><td ${tieneDeuda?'class="celda-deuda-alerta"':''}>$${dDeuda.toFixed(2)}</td><td><span class="badge ${dDeuda >= dLim ? 'bg-danger' : tieneDeuda ? 'bg-warning text-dark' : 'bg-success'}">${dDeuda >= dLim ? 'Cupo Agotado' : tieneDeuda ? 'Deuda Pendiente' : 'Solvente'}</span></td><td><div class="d-flex gap-1 justify-content-center">${botones}</div></td></tr>`;
    });
}

// 2. HISTÓRICO DE CLIENTES
function abrirAuditoriaHistorialCliente(clienteId, nombreCliente) {
    const c = estadoApp.salaActiva.clientes.find(x => x.id === clienteId);
    const deudaGlobal = parseFloat(c.debt_usd || c.deuda_usd);
    
    document.getElementById('lblTituloAuditoriaCliente').innerHTML = `<i class="bi bi-clock-history text-info me-2"></i> Histórico: ${nombreCliente} <span class="badge ${deudaGlobal > 0 ? 'bg-danger' : 'bg-success'} ms-2 fs-6">Deuda Global: $${deudaGlobal.toFixed(2)}</span>`; 
    const tablaContenedor = document.getElementById('tablaAuditoriaClienteContenedor'); 
    
    let historial = (estadoApp.salaActiva.ventas || []).filter(v => v.cliente_id === clienteId);
    historial.sort(sortPorFechaDesc);

    if(historial.length === 0) { 
        tablaContenedor.innerHTML = `<tr><td class="text-muted p-4 text-center">Sin movimientos registrados.</td></tr>`; 
    } else { 
        let h = `<thead class="table-light"><tr><th>Ticket ID</th><th>Fecha</th><th>Modalidad</th><th>Total ($)</th><th>Total (Bs)</th><th>Acciones Administrativas</th></tr></thead><tbody>`; 
        
        historial.forEach((tk, index) => { 
            const mod = tk.mod_pago || tk.metodo_pago; 
            const modLower = mod.toLowerCase();
            const esCredito = modLower.includes('crédito') || modLower.includes('credito') || modLower.includes('fiado');
            
            let txtModalidad = `<span class="badge ${esCredito ? 'bg-warning text-dark' : 'bg-success'}">${mod}</span>`;
            let botonesInternos = `<button class="btn btn-sm btn-primary py-0 px-2 fw-bold" onclick="verDetallesFactura('${tk.id}')"><i class="bi bi-receipt"></i> Ver Detalles</button>`;

            const abonosTicket = (estadoApp.salaActiva.abonos || []).filter(a => a.venta_id === tk.id);
            const totalAbonadoTicket = abonosTicket.reduce((sum, a) => sum + parseFloat(a.monto || a.monto_usd), 0);
            
            let deudaRestanteTicket = 0; let mostrarAbonos = false;

            if (esCredito) {
                deudaRestanteTicket = parseFloat(tk.usd || tk.total_usd) - totalAbonadoTicket;
                mostrarAbonos = true;
            } else if (deudaGlobal > 0 && index === 0) {
                deudaRestanteTicket = deudaGlobal;
                mostrarAbonos = true;
                txtModalidad += `<div class="text-danger mt-1 fw-bold" style="font-size:0.65rem;"><i class="bi bi-exclamation-triangle"></i> Deuda heredada</div>`;
            }

            if(mostrarAbonos) {
                if(deudaRestanteTicket > 0) {
                    txtModalidad += `<div class="text-danger mt-1 fw-bold" style="font-size:0.75rem;">Resta: $${deudaRestanteTicket.toFixed(2)}</div>`;
                    
                    // REGLA DE NEGOCIO: Solo los Empleados pueden hacer abonos
                    if (usuarioAutenticadoObj.rol === "EMPLEADO") {
                        botonesInternos += `<button class="btn btn-sm btn-success py-0 px-2 fw-bold ms-1" onclick="abrirModalAbonarDeuda(${clienteId}, '${tk.id}', ${deudaRestanteTicket})" title="Registrar Pago"><i class="bi bi-cash-coin"></i> Abonar</button>`;
                    }
                } else if (esCredito) {
                    txtModalidad += `<div class="text-success mt-1 fw-bold" style="font-size:0.75rem;"><i class="bi bi-check-all"></i> ¡PAGADO!</div>`;
                }

                if (abonosTicket.length > 0) {
                    botonesInternos += `<button class="btn btn-sm btn-secondary py-0 px-2 fw-bold ms-1" onclick="abrirAuditoriaAbonosCliente('${tk.id}')" title="Ver Historial de Pagos"><i class="bi bi-list-check"></i> Abonos</button>`;
                }
            }

            h += `<tr><td><code>${tk.id}</code></td><td>${tk.fecha || tk.fecha_hora}</td><td>${txtModalidad}</td><td class="fw-bold text-dark">$${parseFloat(tk.usd || tk.total_usd).toFixed(2)}</td><td class="text-muted">${parseFloat(tk.ves || tk.total_ves).toFixed(2)} Bs</td><td><div class="d-flex justify-content-center align-items-center">${botonesInternos}</div></td></tr>`; 
        }); 
        tablaContenedor.innerHTML = h + `</tbody>`; 
    }
    bootstrapAuditoriaClienteModal.show();
}

function abrirModalAbonarDeuda(clienteId, ventaId, deudaMax) { 
    const c = estadoApp.salaActiva.clientes.find(x => x.id === clienteId); 
    document.getElementById('abonoCliId').value = clienteId;
    document.getElementById('abonoVentaId').value = ventaId;
    document.getElementById('abonoCliNombre').innerText = c.name || c.nombre;
    document.getElementById('abonoTicketRef').innerText = ventaId;
    document.getElementById('abonoCliDeudaActual').innerText = `$${deudaMax.toFixed(2)}`; 
    
    const inputMonto = document.getElementById('abonoMontoInput');
    inputMonto.value = ""; 
    inputMonto.max = deudaMax; 

    // Cargar selector de métodos
    const mSel = document.getElementById('abonoSelectMetodo'); mSel.innerHTML = "";
    estadoApp.salaActiva.metodos.forEach(m => mSel.innerHTML += `<option value="${m.name || m.nombre}">${m.name || m.nombre} (${m.moneda})</option>`);
    
    actualizarConversionAbono();
    modalAbonarDeudaInst.show(); 
}

function actualizarConversionAbono() {
    const monto = parseFloat(document.getElementById('abonoMontoInput').value) || 0;
    const metId = document.getElementById('abonoSelectMetodo').value;
    const met = (estadoApp.salaActiva.metodos || []).find(m => m.name === metId || m.nombre === metId);
    const tasa = parseFloat(estadoApp.salaActiva.info.tasa);

    if (met && met.moneda === 'VES') {
        document.getElementById('abonoConversionLabelBs').innerHTML = `A cobrar en Bs: <strong class="text-warning fs-6">${(monto * tasa).toFixed(2)} Bs</strong> (Tasa: ${tasa.toFixed(2)})`;
    } else {
        document.getElementById('abonoConversionLabelBs').innerHTML = `Equivalente: ${(monto * tasa).toFixed(2)} Bs (Tasa: ${tasa.toFixed(2)})`;
    }
}

async function procesarAbonoDeuda(e) {
    e.preventDefault(); 
    const clienteId = parseInt(document.getElementById('abonoCliId').value); 
    const ventaId = document.getElementById('abonoVentaId').value;
    const monto = parseFloat(document.getElementById('abonoMontoInput').value); 
    const metodo = document.getElementById('abonoSelectMetodo').value;
    const tasa = parseFloat(estadoApp.salaActiva.info.tasa);

    const maxPermitido = parseFloat(document.getElementById('abonoMontoInput').max);
    if (monto > maxPermitido) { lanzarAlertaHomedeneda("Error", "El abono supera la deuda de este ticket.", "error"); return; }
    
    const payload = { 
        sala_id: salaActivaId, 
        cliente_id: clienteId, 
        venta_id: ventaId,
        cajero: usuarioAutenticadoObj.username, 
        monto: monto, 
        metodo: metodo,
        tasa: tasa,
        fecha: new Date().toLocaleString('es-ES') 
    };

    try { 
        await fetchAPI('/abonar', 'POST', payload); 
        modalAbonarDeudaInst.hide(); 
        await sincronizarSalaConBackend(); 
        renderizarClientesSalaTable(); 
        actualizarKpisYResumenSala(); 
        lanzarAlertaHomedeneda("Pago Exitoso", `Abono registrado al ticket ${ventaId}.`, "exito"); 
        
        // Refrescar el historial sin cerrarlo
        if(document.getElementById('modalAuditoriaClienteDinamica').classList.contains('show')) {
            const c = estadoApp.salaActiva.clientes.find(x => x.id === clienteId);
            abrirAuditoriaHistorialCliente(clienteId, c.name || c.nombre);
        }
    } catch(err) {}
}

// 3. HISTORIAL DE ABONOS DE TICKET
function abrirAuditoriaAbonosCliente(ventaId) {
    document.getElementById('lblTituloAuditoriaAbonos').innerHTML = `<i class="bi bi-list-check text-secondary me-2"></i> Historial Abonos (Ticket: ${ventaId})`; 
    const tbody = document.getElementById('tablaAuditoriaAbonosContenedor'); 
    const abonos = (estadoApp.salaActiva.abonos || []).filter(a => a.venta_id === ventaId);
    
    // ORDEN CRONOLÓGICO REAL APLICADO
    abonos.sort(sortPorFechaDesc);

    if(abonos.length === 0) { 
        tbody.innerHTML = `<tr><td class="text-muted p-4 text-center">No hay registros de abonos para esta venta.</td></tr>`; 
    } else { 
        let h = `<thead class="table-dark"><tr><th>Fecha/Hora</th><th>Cajero</th><th>Método</th><th>Tasa Operativa</th><th>Monto ($)</th><th>Total Pagado (Bs)</th></tr></thead><tbody>`; 
        
        abonos.forEach(a => {
            const m = parseFloat(a.monto || a.monto_usd);
            const t = parseFloat(a.tasa || estadoApp.salaActiva.info.tasa);
            const met = a.metodo_pago || 'N/A';
            
            h += `<tr><td>${a.fecha || a.fecha_hora}</td><td><span class="badge bg-secondary">@${a.cajero || a.cajero_username}</span></td><td><span class="badge bg-primary">${met}</span></td><td><strong>${t.toFixed(2)} Bs</strong></td><td class="text-success fw-bold">+$${m.toFixed(2)}</td><td class="text-muted">${(m * t).toFixed(2)} Bs</td></tr>`;
        }); 
        tbody.innerHTML = h + `</tbody>`; 
    }
    bootstrapAuditoriaAbonosModal.show();
}

function abrirModalEditarCliente(id) { const c = estadoApp.salaActiva.clientes.find(x => x.id === id); if (c) { document.getElementById('inputEditClienteId').value = c.id; document.getElementById('inputEditNombreCliente').value = c.name || c.nombre; document.getElementById('inputEditLimiteCliente').value = c.limit_usd || c.limite_usd; modalEditarClienteInst.show(); } }
async function guardarEdicionCliente(e) { e.preventDefault(); const id = parseInt(document.getElementById('inputEditClienteId').value); try { await fetchAPI(`/clientes/${id}`, 'PUT', { name: document.getElementById('inputEditNombreCliente').value.trim(), limit_usd: parseFloat(document.getElementById('inputEditLimiteCliente').value) }); modalEditarClienteInst.hide(); await sincronizarSalaConBackend(); renderizarClientesSalaTable(); actualizarKpisYResumenSala(); lanzarAlertaHomedeneda("Actualizado", "Cliente modificado en BD.", "exito"); } catch(err) {} }
async function crearClienteSala(e) { e.preventDefault(); const nombre = document.getElementById('inputNombreCliente').value.trim(); try { await fetchAPI('/clientes', 'POST', { sala_id: salaActivaId, name: nombre, limit_usd: estadoApp.salaActiva.info.default_credit_limit || estadoApp.salaActiva.info.limite_credito_defecto }); document.getElementById('inputNombreCliente').value = ""; modalClienteInst.hide(); await sincronizarSalaConBackend(); renderizarClientesSalaTable(); actualizarKpisYResumenSala(); lanzarAlertaHomedeneda("Éxito", "Cliente creado.", "exito"); } catch(err) {} }
function eliminarClienteSalaConModal(clienteId, nombreCliente) { solicitarConfirmacionEliminar(`¿Remover al cliente "${nombreCliente}"?`, async function() { try { await fetchAPI(`/clientes/${clienteId}`, 'DELETE'); await sincronizarSalaConBackend(); renderizarClientesSalaTable(); actualizarKpisYResumenSala(); } catch(err) {} }); }

// ==========================================
// VISTAS ADMIN Y CONFIGURACIONES
// ==========================================
function renderizarSalasAdminTable() { const tbody = document.getElementById('tablaAdminSalas'); tbody.innerHTML = ""; estadoApp.adminData.salas.forEach(s => { tbody.innerHTML += `<tr><td>SALA-${s.id}</td><td><strong>${s.name || s.nombre}</strong></td><td><span class="badge bg-success">Activa</span></td><td><div class="d-flex gap-1 justify-content-center"><button class="btn btn-sm btn-outline-primary" onclick="abrirModalEditarSala(${s.id})"><i class="bi bi-pencil-fill"></i></button><button class="btn btn-sm btn-outline-danger" onclick="eliminarSalaAdminConModal(${s.id}, '${s.name || s.nombre}')"><i class="bi bi-trash3-fill"></i></button></div></td></tr>`; }); }
function abrirModalCrearSala() { document.getElementById('formNuevaSala').reset(); document.getElementById('inputEditSalaId').value = ""; modalSalaInst.show(); }
function abrirModalEditarSala(id) { const s = estadoApp.adminData.salas.find(x => x.id === id); if (s) { document.getElementById('inputEditSalaId').value = s.id; document.getElementById('inputNombreSala').value = s.name || s.nombre; modalSalaInst.show(); } }
async function crearSalaAdmin(e) { e.preventDefault(); const idEdit = document.getElementById('inputEditSalaId').value; const name = document.getElementById('inputNombreSala').value.trim(); try { if (idEdit) { await fetchAPI(`/salas/${idEdit}`, 'PUT', { name }); } else { await fetchAPI(`/salas`, 'POST', { name, tasa: 45.50, default_credit_limit: 0.00 }); } modalSalaInst.hide(); estadoApp.adminData = await fetchAPI('/admin'); renderizarSalasAdminTable(); } catch(err){} }
function eliminarSalaAdminConModal(id, nombre) { solicitarConfirmacionEliminar(`¿Eliminar sala "${nombre}"?`, async function() { try { await fetchAPI(`/salas/${id}`, 'DELETE'); estadoApp.adminData = await fetchAPI('/admin'); renderizarSalasAdminTable(); } catch(err){} }); }

function renderOpcionesSalasModalSup(salasAsignadas = []) { const sel = document.getElementById('inputSalasAsignadasSup'); sel.innerHTML = ""; estadoApp.adminData.salas.forEach(s => sel.innerHTML += `<option value="${s.id}" ${salasAsignadas.includes(s.id)?'selected':''}>${s.name || s.nombre}</option>`); }
function renderizarSupervisoresAdminTable() { renderOpcionesSalasModalSup(); const tbody = document.getElementById('tablaAdminSupervisores'); tbody.innerHTML = ""; estadoApp.adminData.supervisores.filter(u => u.rol === "SUPERVISOR" || u.rol === "ADMIN").forEach(sup => { let salas = sup.rol === "ADMIN" ? "Acceso Total" : (sup.salasAsignadas||[]).map(id => estadoApp.adminData.salas.find(x => x.id === id)?.name || estadoApp.adminData.salas.find(x => x.id === id)?.nombre).join(', '); let btnEdit = sup.rol === "ADMIN" ? "" : `<button class="btn btn-sm btn-outline-primary" onclick="abrirModalEditarSupervisor(${sup.id})"><i class="bi bi-pencil-fill"></i></button>`; let btnDel = sup.rol === "ADMIN" ? "" : `<button class="btn btn-sm btn-outline-danger" onclick="eliminarSupervisorAdminConModal(${sup.id}, '${sup.username}')"><i class="bi bi-trash3-fill"></i></button>`; tbody.innerHTML += `<tr><td>@${sup.username}</td><td>${sup.name || sup.nombre}</td><td>${salas || 'Sin Asignar'}</td><td><span class="badge ${sup.rol === 'ADMIN' ? 'bg-danger' : 'bg-primary'}">${sup.rol}</span></td><td><div class="d-flex gap-1 justify-content-center">${btnEdit}${btnDel}</div></td></tr>`; }); }
function abrirModalCrearSupervisor() { document.getElementById('formNuevoSupervisor').reset(); document.getElementById('inputEditSupId').value = ""; renderOpcionesSalasModalSup(); modalSupervisorInst.show(); }
function abrirModalEditarSupervisor(id) { const sup = estadoApp.adminData.supervisores.find(u => u.id === id); if (sup && sup.rol !== 'ADMIN') { document.getElementById('inputEditSupId').value = sup.id; document.getElementById('inputNombreSup').value = sup.name || sup.nombre; document.getElementById('inputUsernameSup').value = sup.username; document.getElementById('inputPasswordSup').value = ""; renderOpcionesSalasModalSup(sup.salasAsignadas); modalSupervisorInst.show(); } }
async function crearSupervisorAdmin(e) { e.preventDefault(); const payload = { username: document.getElementById('inputUsernameSup').value.trim(), password: document.getElementById('inputPasswordSup').value, name: document.getElementById('inputNombreSup').value.trim(), rol: "SUPERVISOR", salasAsignadas: Array.from(document.getElementById('inputSalasAsignadasSup').selectedOptions).map(o => parseInt(o.value)) }; const id = document.getElementById('inputEditSupId').value; try { if(id) await fetchAPI(`/supervisores/${id}`, 'PUT', payload); else await fetchAPI('/supervisores', 'POST', payload); modalSupervisorInst.hide(); estadoApp.adminData = await fetchAPI('/admin'); renderizarSupervisoresAdminTable(); } catch(err){} }
function eliminarSupervisorAdminConModal(id, username) { solicitarConfirmacionEliminar(`¿Eliminar a @${username}?`, async function() { try { await fetchAPI(`/supervisores/${id}`, 'DELETE'); estadoApp.adminData = await fetchAPI('/admin'); renderizarSupervisoresAdminTable(); } catch(err){} }); }

function renderizarModuloInventarioGestion() { const tbody = document.getElementById('tablaInventarioGestion'); tbody.innerHTML = ""; const articulos = estadoApp.salaActiva.articulos; if(articulos.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="text-muted p-3">No hay productos.</td></tr>`; return; } articulos.forEach(art => { tbody.innerHTML += `<tr><td><code>${art.code || art.codigo}</code></td><td><strong>${art.name || art.nombre}</strong></td><td>$${parseFloat(art.price_usd || art.precio_usd).toFixed(2)}</td><td><span class="badge bg-light text-dark border font-monospace px-3 fs-6">${art.stock} Un</span></td><td><div class="d-flex gap-1 justify-content-center"><button class="btn btn-sm btn-dark" onclick="abrirModalAjustarStock(${art.id})"><i class="bi bi-box-arrow-in-down"></i> Surtir</button><button class="btn btn-sm btn-danger" onclick="eliminarProductoSupervisorConModal(${art.id})"><i class="bi bi-trash3-fill"></i></button></div></td></tr>`; }); }
function abrirModalAjustarStock(artId) { const art = estadoApp.salaActiva.articulos.find(a => a.id === artId); if (art) { document.getElementById('ajusteStockArtId').value = art.id; document.getElementById('ajusteStockNombreArt').innerText = art.name || art.nombre; document.getElementById('ajusteStockInput').value = art.stock; modalAjustarStockInst.show(); } }
async function guardarAjusteStock(e) { e.preventDefault(); const artId = parseInt(document.getElementById('ajusteStockArtId').value); const nStock = parseInt(document.getElementById('ajusteStockInput').value); try { await fetchAPI(`/articulos/${artId}/stock`, 'PUT', { stock: nStock }); modalAjustarStockInst.hide(); await sincronizarSalaConBackend(); renderizarModuloInventarioGestion(); actualizarKpisYResumenSala(); } catch(err) {} }
async function crearProductoSupervisor(e) { e.preventDefault(); const payload = { sala_id: salaActivaId, code: document.getElementById('inputProdCode').value.trim(), name: document.getElementById('inputProdName').value.trim(), price_usd: parseFloat(document.getElementById('inputProdPrice').value), stock: parseInt(document.getElementById('inputProdStockInicial').value) || 0 }; try { await fetchAPI('/articulos', 'POST', payload); modalProductoInst.hide(); await sincronizarSalaConBackend(); renderizarModuloInventarioGestion(); actualizarKpisYResumenSala(); } catch(err) {} }
function eliminarProductoSupervisorConModal(artId) { solicitarConfirmacionEliminar(`¿Desea eliminar este producto?`, async function() { try { await fetchAPI(`/articulos/${artId}`, 'DELETE'); await sincronizarSalaConBackend(); renderizarModuloInventarioGestion(); actualizarKpisYResumenSala(); } catch(err) {} }); }

function renderizarEmpleadosSalaTable() { const tbody = document.getElementById('tablaSupervisorEmpleados'); tbody.innerHTML = ""; const emp = estadoApp.adminData.supervisores.filter(u => u.salasAsignadas.includes(salaActivaId)); if(emp.length===0){ tbody.innerHTML=`<tr><td colspan="5" class="text-muted p-3">No hay personal.</td></tr>`; return;} emp.forEach(u => { tbody.innerHTML += `<tr><td>@${u.username}</td><td>${u.name || u.nombre}</td><td>${estadoApp.salaActiva.info.name || estadoApp.salaActiva.info.nombre}</td><td><span class="badge bg-secondary">${u.rol}</span></td><td><div class="d-flex gap-1 justify-content-center"><button class="btn btn-sm btn-outline-primary" onclick="abrirModalEditarEmpleado(${u.id})"><i class="bi bi-pencil-fill"></i></button><button class="btn btn-sm btn-outline-danger" onclick="eliminarEmpleadoSupervisorConModal(${u.id}, '${u.username}')"><i class="bi bi-trash3-fill"></i></button></div></td></tr>`; }); }
function abrirModalCrearEmpleado() { document.getElementById('formNuevoEmpleado').reset(); document.getElementById('inputEditEmpId').value = ""; modalEmpleadoInst.show(); }
function abrirModalEditarEmpleado(id) { const emp = estadoApp.adminData.supervisores.find(u => u.id === id); if(emp) { document.getElementById('inputEditEmpId').value = emp.id; document.getElementById('inputNombreEmp').value = emp.name || emp.nombre; document.getElementById('inputUsernameEmp').value = emp.username; document.getElementById('inputPasswordEmp').value = ""; document.getElementById('inputRolEmp').value = emp.rol; modalEmpleadoInst.show(); } }
async function guardarEmpleadoSupervisor(e) { e.preventDefault(); const payload = { username: document.getElementById('inputUsernameEmp').value.trim(), password: document.getElementById('inputPasswordEmp').value, name: document.getElementById('inputNombreEmp').value.trim(), rol: document.getElementById('inputRolEmp').value, salasAsignadas: [salaActivaId] }; const id = document.getElementById('inputEditEmpId').value; try { if(id) await fetchAPI(`/supervisores/${id}`, 'PUT', payload); else await fetchAPI('/supervisores', 'POST', payload); modalEmpleadoInst.hide(); estadoApp.adminData = await fetchAPI('/admin'); renderizarEmpleadosSalaTable(); } catch(err){} }
function eliminarEmpleadoSupervisorConModal(id, username) { solicitarConfirmacionEliminar(`¿Desvincular a @${username}?`, async function() { try { await fetchAPI(`/supervisores/${id}`, 'DELETE'); estadoApp.adminData = await fetchAPI('/admin'); renderizarEmpleadosSalaTable(); } catch(err){} }); }

function renderizarTurnosConfigTable() { const tbody = document.getElementById('tablaSupervisorTurnosConfigurados'); tbody.innerHTML = ""; const turnos = estadoApp.salaActiva.turnos || []; if (turnos.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="text-muted p-3">No hay turnos operativos.</td></tr>`; return; } turnos.forEach(t => { tbody.innerHTML += `<tr><td><strong>${t.name || t.nombre}</strong></td><td><span class="badge bg-light text-dark">${t.inicio || t.hora_inicio}</span></td><td><span class="badge bg-light text-dark">${t.fin || t.hora_fin}</span></td><td>${t.nocturno || t.cruza_medianoche ? '<span class="badge bg-danger">Si</span>' : '<span class="badge bg-success">No</span>'}</td><td><div class="d-flex gap-1 justify-content-center"><button class="btn btn-sm btn-outline-primary" onclick="abrirModalEditarTurno(${t.id})"><i class="bi bi-pencil-fill"></i></button><button class="btn btn-sm btn-outline-danger" onclick="eliminarTurnoSalaConModal(${t.id}, '${t.name || t.nombre}')"><i class="bi bi-trash3-fill"></i></button></div></td></tr>`; }); }
function abrirModalCrearTurno() { document.getElementById('formNuevoTurno').reset(); document.getElementById('inputEditTurnoId').value = ""; modalTurnoInst.show(); }
function abrirModalEditarTurno(turnoId) { const t = estadoApp.salaActiva.turnos.find(x => x.id === turnoId); if(t) { document.getElementById('inputEditTurnoId').value = t.id; document.getElementById('inputNombreTurno').value = t.name || t.nombre; document.getElementById('inputHoraInicioTurno').value = t.inicio || t.hora_inicio; document.getElementById('inputHoraFinTurno').value = t.fin || t.hora_fin; document.getElementById('inputCruzaMedianoche').checked = t.nocturno || t.cruza_medianoche; modalTurnoInst.show(); } }
async function guardarTurnoSala(e) { e.preventDefault(); const id = document.getElementById('inputEditTurnoId').value; const payload = { sala_id: salaActivaId, name: document.getElementById('inputNombreTurno').value.trim(), inicio: document.getElementById('inputHoraInicioTurno').value, fin: document.getElementById('inputHoraFinTurno').value, nocturno: document.getElementById('inputCruzaMedianoche').checked }; try { if(id) await fetchAPI(`/turnos/${id}`, 'PUT', payload); else await fetchAPI('/turnos', 'POST', payload); modalTurnoInst.hide(); await sincronizarSalaConBackend(); renderizarTurnosConfigTable(); } catch(err){} }
function eliminarTurnoSalaConModal(id, nombre) { solicitarConfirmacionEliminar(`¿Eliminar turno "${nombre}"?`, async function() { try { await fetchAPI(`/turnos/${id}`, 'DELETE'); await sincronizarSalaConBackend(); renderizarTurnosConfigTable(); } catch(err){} }); }

function renderizarMetodosPagoConfigTable() { const tbody = document.getElementById('tablaSupervisorMetodosPagoConfigurados'); tbody.innerHTML = ""; const metodos = estadoApp.salaActiva.metodos || []; if (metodos.length === 0) { tbody.innerHTML = `<tr><td colspan="3" class="text-muted p-3">No hay métodos de pago.</td></tr>`; return; } metodos.forEach(m => { tbody.innerHTML += `<tr><td><strong>${m.name || m.nombre}</strong></td><td><span class="badge ${m.moneda==='USD'?'bg-success':'bg-primary'}">${m.moneda}</span></td><td><div class="d-flex gap-1 justify-content-center"><button class="btn btn-sm btn-outline-primary" onclick="abrirModalEditarMetodoPago(${m.id})"><i class="bi bi-pencil-fill"></i></button><button class="btn btn-sm btn-outline-danger" onclick="eliminarMetodoPagoSalaConModal(${m.id}, '${m.name || m.nombre}')"><i class="bi bi-trash3-fill"></i></button></div></td></tr>`; }); }
function abrirModalCrearMetodoPago() { document.getElementById('formNuevoMetodoPago').reset(); document.getElementById('inputEditMetodoId').value = ""; modalMetodoPagoInst.show(); }
function abrirModalEditarMetodoPago(metodoId) { const m = estadoApp.salaActiva.metodos.find(x => x.id === metodoId); if(m) { document.getElementById('inputEditMetodoId').value = m.id; document.getElementById('inputNombreMetodo').value = m.name || m.nombre; document.getElementById('inputMonedaMetodo').value = m.moneda; modalMetodoPagoInst.show(); } }
async function guardarMetodoPagoSala(e) { e.preventDefault(); const id = document.getElementById('inputEditMetodoId').value; const payload = { sala_id: salaActivaId, name: document.getElementById('inputNombreMetodo').value.trim(), moneda: document.getElementById('inputMonedaMetodo').value }; try { if(id) await fetchAPI(`/metodos_pago/${id}`, 'PUT', payload); else await fetchAPI('/metodos_pago', 'POST', payload); modalMetodoPagoInst.hide(); await sincronizarSalaConBackend(); renderizarMetodosPagoConfigTable(); } catch(err){} }
function eliminarMetodoPagoSalaConModal(id, nombre) { solicitarConfirmacionEliminar(`¿Eliminar método "${nombre}"?`, async function() { try { await fetchAPI(`/metodos_pago/${id}`, 'DELETE'); await sincronizarSalaConBackend(); renderizarMetodosPagoConfigTable(); } catch(err){} }); }

// 4. MATRIZ GLOBAL (SUPERVISOR)
function renderizarMatrizVentasAuditoria() {
    const tabla = document.getElementById('tablaDinamicaMatrizTurnos'); tabla.innerHTML = "";
    const turnos = estadoApp.salaActiva.turnos || []; const ventas = estadoApp.salaActiva.ventas || [];
    if(turnos.length === 0) { tabla.innerHTML = `<tbody><tr><td class="p-3 text-muted">No hay turnos.</td></tr></tbody>`; return; }
    
    let ventasPorFecha = {}; 
    ventas.forEach(v => { const fechaReal = v.fecha ? v.fecha.split(' ')[0] : v.fecha_hora.split(' ')[0]; if(!ventasPorFecha[fechaReal]) ventasPorFecha[fechaReal] = []; ventasPorFecha[fechaReal].push(v); });
    
    let thTurnos = ""; let subHeaders = "";
    turnos.forEach(t => { thTurnos += `<th colspan="2" class="table-secondary small">${t.name || t.nombre} ${t.nocturno || t.cruza_medianoche ? '' : ''}</th>`; subHeaders += `<th class="text-muted" style="font-size:0.75rem;">USD ($)</th><th class="text-muted" style="font-size:0.75rem;">Ver</th>`; });
    
    let headerHtml = `<thead class="table-light align-middle"><tr><th rowspan="2" class="bg-dark text-white text-center">Fecha</th>${thTurnos}<th colspan="2" class="table-success text-dark text-center">Cierre Total General</th></tr><tr>${subHeaders}<th class="text-dark bg-light fw-bold" style="font-size:0.75rem;">Total ($)</th><th class="text-dark bg-light" style="font-size:0.75rem;">Acción</th></tr></thead><tbody>`;
    
    // ORDENA LOS DÍAS DESDE EL MÁS RECIENTE
    const fechas = Object.keys(ventasPorFecha).sort((a, b) => {
        const [d1, m1, y1] = a.split('-'); const [d2, m2, y2] = b.split('-');
        return new Date(y2, m2-1, d2).getTime() - new Date(y1, m1-1, d1).getTime();
    });
    
    if(fechas.length === 0) { headerHtml += `<tr><td colspan="${(turnos.length * 2) + 3}" class="text-muted p-3">Ningún registro en el histórico.</td></tr>`; } 
    else { 
        fechas.forEach(fecha => { 
            const ticketsDia = ventasPorFecha[fecha]; let celdasTurnos = ""; let totalDiaUsd = 0; 
            turnos.forEach(t => { 
                const ticketsTurno = ticketsDia.filter(tk => parseInt(tk.turno_id) === t.id); 
                const totalTurno = ticketsTurno.reduce((acc, tk) => acc + parseFloat(tk.usd || tk.total_usd), 0); 
                totalDiaUsd += totalTurno; 
                celdasTurnos += `<td class="fw-bold text-dark">$${totalTurno.toFixed(2)}</td><td><button class="btn btn-xs btn-outline-primary py-0 px-1" style="font-size:0.7rem;" onclick="verDetalleTurnoEspecifico('${fecha}', ${t.id})"><i class="bi bi-search"></i></button></td>`; 
            }); 
            headerHtml += `<tr><td class="fw-bold">${fecha}</td>${celdasTurnos}<td class="table-success fw-bold text-success">$${totalDiaUsd.toFixed(2)}</td><td class="table-success"><button class="btn btn-xs btn-success py-0 px-2 text-white fw-bold" style="font-size:0.75rem;" onclick="verDesgloseCierreTotalGeneral('${fecha}')"><i class="bi bi-search"></i> Revisar Todo</button></td></tr>`; 
        }); 
    }
    tabla.innerHTML = headerHtml + "</tbody>";
}

// 5. AUDITORÍA TRANSACCIONAL (SUPERVISOR)
function verDetalleTurnoEspecifico(fecha, turnoTargetId) {
    const ventas = estadoApp.salaActiva.ventas || []; 
    const targetTickets = ventas.filter(v => (v.fecha ? v.fecha.split(' ')[0] : v.fecha_hora.split(' ')[0]) === fecha && parseInt(v.turno_id) === turnoTargetId); 
    const tObj = estadoApp.salaActiva.turnos.find(t => t.id === turnoTargetId); 
    
    document.getElementById('lblTituloModalTurno').innerText = `Auditoría Transaccional - Día: ${fecha} | Turno: ${tObj.name || tObj.nombre}`; 
    const tbodyModal = document.getElementById('tablaDetallesEspecificosTurno'); tbodyModal.innerHTML = "";
    
    targetTickets.sort(sortPorFechaDesc);

    if(targetTickets.length === 0) { 
        tbodyModal.innerHTML = `<tr><td colspan="11" class="text-muted p-3">Ninguna transacción liquidada en este bloque.</td></tr>`; 
    } else { 
        targetTickets.forEach(t => { 
            const mod = t.mod_pago || t.metodo_pago;
            const esCredito = mod.toLowerCase().includes('crédito') || mod.toLowerCase().includes('credito') || mod.toLowerCase().includes('fiado');
            
            let tasaStr = esCredito ? '<span class="text-muted">N/A</span>' : `${parseFloat(t.tasa || t.tasa_aplicada).toFixed(2)} Bs`;
            let vesStr = esCredito ? '<span class="text-muted">N/A</span>' : `${parseFloat(t.ves || t.total_ves).toFixed(2)} Bs`;
            
            let statusBadge = `<span class="badge bg-success">Pagada</span>`;
            let btnAbonos = '';

            if (esCredito) {
                const abonosTicket = (estadoApp.salaActiva.abonos || []).filter(a => a.venta_id === t.id);
                const totalAbonado = abonosTicket.reduce((sum, a) => sum + parseFloat(a.monto || a.monto_usd), 0);
                const deuda = parseFloat(t.usd || t.total_usd) - totalAbonado;
                
                statusBadge = deuda > 0 ? `<span class="badge bg-danger">Debe $${deuda.toFixed(2)}</span>` : `<span class="badge bg-success">Pagada</span>`;
                btnAbonos = `<button class="btn btn-sm btn-secondary py-0 px-2 fw-bold ms-1" onclick="abrirAuditoriaAbonosCliente('${t.id}')" title="Ver Abonos"><i class="bi bi-list-check"></i> Abonos</button>`;
            }

            tbodyModal.innerHTML += `<tr><td><code>${t.id}</code></td><td><strong>${t.fecha || t.fecha_hora}</strong></td><td><span class="badge bg-secondary">${tObj.name || tObj.nombre}</span></td><td><strong>@${t.cajero || t.cajero_username}</strong></td><td>${t.cliente}</td><td><span class="badge ${esCredito ? 'bg-warning text-dark' : 'bg-success'}">${mod}</span></td><td>${tasaStr}</td><td class="fw-bold text-success">$${parseFloat(t.usd||t.total_usd).toFixed(2)}</td><td class="text-muted">${vesStr}</td><td>${statusBadge}</td><td><div class="d-flex justify-content-center align-items-center"><button class="btn btn-sm btn-primary py-0 px-2 fw-bold" onclick="verDetallesFactura('${t.id}')"><i class="bi bi-receipt"></i></button>${btnAbonos}</div></td></tr>`; 
        }); 
    }
    bootstrapDetalleTurnoModal.show();
}

// 6. DESGLOSE GENERAL DE CIERRE (SUPERVISOR)
function verDesgloseCierreTotalGeneral(fecha) {
    const ventas = estadoApp.salaActiva.ventas || []; 
    const targetTickets = ventas.filter(v => (v.fecha ? v.fecha.split(' ')[0] : v.fecha_hora.split(' ')[0]) === fecha); 
    const turnos = estadoApp.salaActiva.turnos || []; 
    
    document.getElementById('lblTituloModalTurno').innerText = `Desglose Cierre Total - Jornada: ${fecha}`; 
    const tbodyModal = document.getElementById('tablaDetallesEspecificosTurno'); tbodyModal.innerHTML = "";
    
    targetTickets.sort(sortPorFechaDesc);

    if(targetTickets.length === 0) { 
        tbodyModal.innerHTML = `<tr><td colspan="11" class="text-muted p-3">No hay tickets emitidos.</td></tr>`; 
    } else { 
        targetTickets.forEach(t => { 
            const tObj = turnos.find(x => x.id === parseInt(t.turno_id)); 
            const nombreTurno = tObj ? (tObj.name || tObj.nombre) : "Desconocido"; 
            const mod = t.mod_pago || t.metodo_pago;
            const esCredito = mod.toLowerCase().includes('crédito') || mod.toLowerCase().includes('credito') || mod.toLowerCase().includes('fiado');
            
            let tasaStr = esCredito ? '<span class="text-muted">N/A</span>' : `${parseFloat(t.tasa || t.tasa_aplicada).toFixed(2)} Bs`;
            let vesStr = esCredito ? '<span class="text-muted">N/A</span>' : `${parseFloat(t.ves || t.total_ves).toFixed(2)} Bs`;
            
            let statusBadge = `<span class="badge bg-success">Pagada</span>`;
            let btnAbonos = '';

            if (esCredito) {
                const abonosTicket = (estadoApp.salaActiva.abonos || []).filter(a => a.venta_id === t.id);
                const totalAbonado = abonosTicket.reduce((sum, a) => sum + parseFloat(a.monto || a.monto_usd), 0);
                const deuda = parseFloat(t.usd || t.total_usd) - totalAbonado;
                
                statusBadge = deuda > 0 ? `<span class="badge bg-danger">Debe $${deuda.toFixed(2)}</span>` : `<span class="badge bg-success">Pagada</span>`;
                btnAbonos = `<button class="btn btn-sm btn-secondary py-0 px-2 fw-bold ms-1" onclick="abrirAuditoriaAbonosCliente('${t.id}')" title="Ver Abonos"><i class="bi bi-list-check"></i> Abonos</button>`;
            }

            tbodyModal.innerHTML += `<tr><td><code>${t.id}</code></td><td><strong>${t.fecha || t.fecha_hora}</strong></td><td><span class="badge bg-dark text-warning">${nombreTurno}</span></td><td><strong>@${t.cajero || t.cajero_username}</strong></td><td>${t.cliente}</td><td><span class="badge ${esCredito ? 'bg-warning text-dark' : 'bg-success'}">${mod}</span></td><td>${tasaStr}</td><td class="fw-bold text-success">$${parseFloat(t.usd||t.total_usd).toFixed(2)}</td><td class="text-muted">${vesStr}</td><td>${statusBadge}</td><td><div class="d-flex justify-content-center align-items-center"><button class="btn btn-sm btn-primary py-0 px-2 fw-bold" onclick="verDetallesFactura('${t.id}')"><i class="bi bi-receipt"></i></button>${btnAbonos}</div></td></tr>`; 
        }); 
    }
    bootstrapDetalleTurnoModal.show();
}
async function procesarNuevaTasaSupervisor(e) { e.preventDefault(); try { await fetchAPI(`/salas/${salaActivaId}/tasa`, 'PUT', { tasa: parseFloat(document.getElementById('inputMontoNuevaTasa').value) }); bootstrapTasaModal.hide(); await sincronizarSalaConBackend(); actualizarKpisYResumenSala(); } catch(err){} }
async function procesarNuevoCreditoGlobalSupervisor(e) { e.preventDefault(); try { await fetchAPI(`/salas/${salaActivaId}/credito`, 'PUT', { limite: parseFloat(document.getElementById('inputMontoNuevoCreditoGlobal').value) }); bootstrapCreditoGlobalModal.hide(); await sincronizarSalaConBackend(); actualizarKpisYResumenSala(); } catch(err){} }
function abrirModalModificarTasa() { document.getElementById('inputMontoNuevaTasa').value = parseFloat(estadoApp.salaActiva.info.tasa); bootstrapTasaModal.show(); }
function abrirModalModificarCreditoGlobal() { document.getElementById('inputMontoNuevoCreditoGlobal').value = parseFloat(estadoApp.salaActiva.info.default_credit_limit || estadoApp.salaActiva.info.limite_credito_defecto); bootstrapCreditoGlobalModal.show(); }

// ==========================================
// MÓDULO DE ESTADÍSTICAS AVANZADAS (CHART.JS)
// ==========================================
let graficosDashboard = {};

function renderizarDashboardSupervisor() {
    const filtro = document.getElementById('filtroTiempoDashboard').value;
    const ventasFull = estadoApp.salaActiva.ventas || [];
    const clientesFull = estadoApp.salaActiva.clientes || [];
    const turnos = estadoApp.salaActiva.turnos || [];
    
    const hoy = new Date();
    const isMismoDia = (d1, d2) => d1.getDate()===d2.getDate() && d1.getMonth()===d2.getMonth() && d1.getFullYear()===d2.getFullYear();
    const isMismoMes = (d1, d2) => d1.getMonth()===d2.getMonth() && d1.getFullYear()===d2.getFullYear();

    // Matriz de nombres para mostrar etiquetas corporativas legibles con el año
    const nombresMeses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

    // 1. Filtrar las transacciones según el rango seleccionado
    const ventas = ventasFull.filter(v => {
        if (filtro === 'todo') return true;
        const partes = (v.fecha || v.fecha_hora).split(' ')[0].split('-');
        const fVenta = new Date(partes[2], partes[1]-1, partes[0]);
        if (filtro === 'hoy') return isMismoDia(fVenta, hoy);
        if (filtro === 'mes') return isMismoMes(fVenta, hoy);
        return true;
    });

    let ingresosTotales = 0;
    let ventasPorCajero = {};
    let ventasPorProducto = {};
    let ventasPorMetodo = {};
    let ventasPorTurno = {};
    let ventasPorCliente = {};
    let evolucionFechas = {}; 

    // 2. Procesar y clasificar métricas métricas
    ventas.forEach(v => {
        const usd = parseFloat(v.usd || v.total_usd || 0);
        ingresosTotales += usd;

        const c = v.cajero || v.cajero_username || "Desconocido";
        ventasPorCajero[c] = (ventasPorCajero[c] || 0) + usd;

        const m = v.mod_pago || v.metodo_pago || "Desconocido";
        ventasPorMetodo[m] = (ventasPorMetodo[m] || 0) + usd;

        ventasPorTurno[v.turno_id] = (ventasPorTurno[v.turno_id] || 0) + usd;

        if (v.cliente && v.cliente.toLowerCase() !== 'publico general' && v.cliente.toLowerCase() !== 'público general') {
            ventasPorCliente[v.cliente] = (ventasPorCliente[v.cliente] || 0) + usd;
        }

        // AGRUPACIÓN DINÁMICA E INTELIGENTE INCLUYENDO EL AÑO
        const [fechaStr, horaStr] = (v.fecha || v.fecha_hora).split(' ');
        let keyEvo = fechaStr; 
        
        if (filtro === 'hoy') {
            keyEvo = horaStr.split(':')[0] + ':00'; // Agrupación por franja horaria
        } else if (filtro === 'todo') {
            const p = fechaStr.split('-');
            const mesIdx = parseInt(p[1]) - 1;
            keyEvo = `${nombresMeses[mesIdx]} ${p[2]}`; // Vinculación estricta de Mes + Año (Ej: "May 2026")
        }
        
        evolucionFechas[keyEvo] = (evolucionFechas[keyEvo] || 0) + usd;

        const arts = typeof v.articulos === 'string' ? JSON.parse(v.articulos) : (v.articulos || []);
        arts.forEach(a => {
            const n = a.name || a.nombre;
            const cant = parseInt(a.cant || a.cantidad);
            ventasPorProducto[n] = (ventasPorProducto[n] || 0) + cant;
        });
    });

    const deudaTotal = clientesFull.reduce((acc, c) => acc + parseFloat(c.debt_usd || c.deuda_usd), 0);

    // 3. Renderizar KPIs informativos superiores
    document.getElementById('kpiIngresos').innerText = `$${ingresosTotales.toFixed(2)}`;
    document.getElementById('kpiDeuda').innerText = `$${deudaTotal.toFixed(2)}`;
    document.getElementById('kpiTickets').innerText = ventas.length;
    document.getElementById('kpiTicketPromedio').innerText = ventas.length ? `$${(ingresosTotales / ventas.length).toFixed(2)}` : '$0.00';
    
    const mejorCajero = Object.keys(ventasPorCajero).sort((a,b)=>ventasPorCajero[b]-ventasPorCajero[a])[0] || "-";
    const mejorProducto = Object.keys(ventasPorProducto).sort((a,b)=>ventasPorProducto[b]-ventasPorProducto[a])[0] || "-";
    document.getElementById('kpiCajeroTop').innerText = mejorCajero !== "-" ? `@${mejorCajero}` : "-";
    document.getElementById('kpiProdTop').innerText = mejorProducto;

    const crearGrafico = (id, config) => {
        if(graficosDashboard[id]) graficosDashboard[id].destroy();
        graficosDashboard[id] = new Chart(document.getElementById(id), config);
    };

    // 4. ORDENAMIENTO CRONOLÓGICO SEGURO BASADO EN EL FILTRO
    let labelsEvo = Object.keys(evolucionFechas).sort((a,b) => {
        if(filtro === 'hoy') return parseInt(a) - parseInt(b);
        if(filtro === 'todo') {
            const [m1, y1] = a.split(' '); const [m2, y2] = b.split(' ');
            return new Date(y1, nombresMeses.indexOf(m1)).getTime() - new Date(y2, nombresMeses.indexOf(m2)).getTime();
        }
        const [d1,m1,y1] = a.split('-'); const [d2,m2,y2] = b.split('-');
        return new Date(y1, m1-1, d1).getTime() - new Date(y2, m2-1, d2).getTime();
    });

    // --- GRÁFICO LÍNEA DE EVOLUCIÓN ---
    crearGrafico('chartEvolucion', {
        type: 'line',
        data: {
            labels: labelsEvo.length ? labelsEvo : ["Sin datos"],
            datasets: [{
                label: 'Ventas USD ($)',
                data: labelsEvo.length ? labelsEvo.map(l => evolucionFechas[l]) : [0],
                borderColor: '#0d6efd', backgroundColor: 'rgba(13, 110, 253, 0.2)',
                tension: 0.3, fill: true
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // --- GRÁFICO DONA DE TURNOS ---
    const labelsTurnos = Object.keys(ventasPorTurno).map(id => {
        const t = turnos.find(x => x.id == parseInt(id));
        return t ? (t.name || t.nombre) : `Turno ${id}`;
    });
    crearGrafico('chartTurnosDashboard', {
        type: 'doughnut',
        data: {
            labels: labelsTurnos.length ? labelsTurnos : ["Sin datos"],
            datasets: [{
                data: Object.values(ventasPorTurno).length ? Object.values(ventasPorTurno) : [1],
                backgroundColor: ['#198754', '#ffc107', '#dc3545', '#0dcaf0', '#6610f2']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });

    // --- GRÁFICO TOP PRODUCTOS ---
    const topProds = Object.entries(ventasPorProducto).sort((a,b)=>b[1]-a[1]).slice(0,5);
    crearGrafico('chartTopProductos', {
        type: 'bar',
        data: {
            labels: topProds.length ? topProds.map(p=>p[0]) : ["-"],
            datasets: [{ label: 'Unidades Vendidas', data: topProds.length ? topProds.map(p=>p[1]) : [0], backgroundColor: '#0dcaf0' }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // --- GRÁFICO TOP MEJORES CLIENTES ---
    const topClientes = Object.entries(ventasPorCliente).sort((a,b)=>b[1]-a[1]).slice(0,5);
    crearGrafico('chartMejoresClientes', {
        type: 'bar',
        data: {
            labels: topClientes.length ? topClientes.map(c=>c[0]) : ["-"],
            datasets: [{ label: 'Compras ($)', data: topClientes.length ? topClientes.map(c=>c[1]) : [0], backgroundColor: '#198754' }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // --- GRÁFICO MÉTODOS DE PAGO ---
    crearGrafico('chartMetodosPagoDashboard', {
        type: 'doughnut',
        data: {
            labels: Object.keys(ventasPorMetodo).length ? Object.keys(ventasPorMetodo) : ["-"],
            datasets: [{
                data: Object.values(ventasPorMetodo).length ? Object.values(ventasPorMetodo) : [1],
                backgroundColor: ['#6c757d', '#fd7e14', '#20c997', '#e83e8c', '#d63384']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });
}