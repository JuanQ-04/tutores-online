// js/login-toggle.js
// Mostrar/ocultar contraseña en login (antes era un <script> inline).
const toggleBtn = document.getElementById('btn-toggle-password');
const pwdInput = document.getElementById('password');
if (toggleBtn && pwdInput) {
  toggleBtn.addEventListener('click', () => {
    const isPass = pwdInput.type === 'password';
    pwdInput.type = isPass ? 'text' : 'password';
    toggleBtn.textContent = isPass ? 'Ocultar' : 'Mostrar';
  });
}
