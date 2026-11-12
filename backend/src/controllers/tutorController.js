export const crearTutorController = ({ tutorService }) => ({
  async buscar(req, res) {
    res.json(await tutorService.buscar(req.query));
  },
  async obtener(req, res) {
    res.json(await tutorService.obtener(req.params.id));
  },
  async calificaciones(req, res) {
    res.json(await tutorService.listarCalificaciones(req.params.id, req.query.limite));
  }
});
