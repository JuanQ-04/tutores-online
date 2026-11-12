export const crearSolicitudController = ({ solicitudService }) => ({
  async crear(req, res) {
    res.status(201).json(await solicitudService.crear(req.usuario, req.body));
  },
  async mias(req, res) {
    res.json(await solicitudService.listarMias(req.usuario));
  },
  async aceptar(req, res) {
    res.json(await solicitudService.aceptar(req.usuario, req.params.id));
  },
  async rechazar(req, res) {
    res.json(await solicitudService.rechazar(req.usuario, req.params.id));
  },
  async cancelar(req, res) {
    res.json(await solicitudService.cancelar(req.usuario, req.params.id));
  }
});
