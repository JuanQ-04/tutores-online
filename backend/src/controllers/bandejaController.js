export const crearBandejaController = ({ bandejaService }) => ({
  async listar(req, res) {
    res.json(await bandejaService.listar(req.usuario));
  },
  async marcarLeida(req, res) {
    res.json(await bandejaService.marcarLeida(req.usuario, req.params.id));
  },
  async marcarTodas(req, res) {
    res.json(await bandejaService.marcarTodas(req.usuario));
  }
});
