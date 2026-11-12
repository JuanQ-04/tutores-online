export const crearMateriaController = ({ materiaService }) => ({
  async listar(_req, res) {
    res.json(await materiaService.listar());
  }
});
