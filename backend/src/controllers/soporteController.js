export const crearSoporteController = ({ soporteService }) => ({
  async crear(req, res) {
    res.status(201).json(await soporteService.crear(req.usuario, req.body));
  }
});
