export const crearCalificacionController = ({ calificacionService }) => ({
  async crear(req, res) {
    res.status(201).json(await calificacionService.crear(req.usuario, req.body));
  }
});
