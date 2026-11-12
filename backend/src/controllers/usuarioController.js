export const crearUsuarioController = ({ usuarioService, cambioPerfilService }) => ({
  async registrar(req, res) {
    const { perfil, creado } = await usuarioService.registrar(req.identidad, req.body);
    res.status(creado ? 201 : 200).json(perfil);
  },
  async miPerfil(req, res) {
    res.json(await usuarioService.miPerfil(req.identidad));
  },
  async actualizar(req, res) {
    res.json(await usuarioService.actualizarPerfil(req.usuario, req.body));
  },
  async guardarFoto(req, res) {
    res.json(await usuarioService.guardarFoto(req.usuario, req.body?.fotoURL));
  },
  async agregarBloque(req, res) {
    res.status(201).json(await usuarioService.agregarBloque(req.usuario, req.body));
  },
  async quitarBloque(req, res) {
    res.json(await usuarioService.quitarBloque(req.usuario, req.params.id));
  },
  async enviarSolicitudTutor(req, res) {
    res.json(await usuarioService.enviarSolicitudTutor(req.usuario, req.body));
  },
  async miSolicitudCambio(req, res) {
    res.json(await cambioPerfilService.obtenerMia(req.usuario));
  },
  async solicitarCambio(req, res) {
    res.status(201).json(await cambioPerfilService.solicitar(req.usuario, req.body));
  },
  async cancelarCambio(req, res) {
    res.json(await cambioPerfilService.cancelar(req.usuario));
  }
});
