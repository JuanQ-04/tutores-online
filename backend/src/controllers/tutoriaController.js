export const crearTutoriaController = ({ tutoriaService }) => ({
  async mias(req, res) {
    res.json(await tutoriaService.listarMias(req.usuario));
  },
  async obtener(req, res) {
    res.json(await tutoriaService.obtener(req.usuario, req.params.id));
  },
  async completar(req, res) {
    res.json(await tutoriaService.completar(req.usuario, req.params.id));
  },
  async cancelar(req, res) {
    res.json(await tutoriaService.cancelar(req.usuario, req.params.id));
  }
});
