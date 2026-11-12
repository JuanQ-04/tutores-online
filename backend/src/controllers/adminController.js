export const crearAdminController = ({ adminService, materiaService, cambioPerfilService }) => ({
  async usuarios(req, res) {
    res.json(await adminService.listarUsuarios(req.query.rol));
  },
  async tutorias(_req, res) {
    res.json(await adminService.listarTutorias());
  },
  async solicitudes(_req, res) {
    res.json(await adminService.listarSolicitudes());
  },
  async calificaciones(_req, res) {
    res.json(await adminService.listarCalificaciones());
  },
  async soporte(_req, res) {
    res.json(await adminService.listarSoporte());
  },
  async hojaDeVida(req, res) {
    res.json(await adminService.obtenerHojaVida(req.params.id, { pendiente: req.query.pendiente === "true" }));
  },
  async cambiarActivo(req, res) {
    res.json(await adminService.cambiarActivo(req.usuario, req.params.id, req.body));
  },
  async revisarTutor(req, res) {
    res.json(await adminService.revisarTutor(req.usuario, req.params.id, req.body));
  },
  async moderarCalificacion(req, res) {
    res.json(await adminService.moderarCalificacion(req.usuario, req.params.id, req.body));
  },
  async actualizarCaso(req, res) {
    res.json(await adminService.actualizarCaso(req.usuario, req.params.id, req.body));
  },
  async crearMateria(req, res) {
    res.status(201).json(await materiaService.crear(req.usuario, req.body));
  },
  async cambiosPerfil(_req, res) {
    res.json(await cambioPerfilService.listar());
  },
  async resolverCambioPerfil(req, res) {
    res.json(await cambioPerfilService.resolver(req.usuario, req.params.id, req.body));
  }
});
