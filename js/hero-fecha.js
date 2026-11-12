// js/hero-fecha.js
// Fecha del día en la tarjeta decorativa del hero (antes era un <script> inline).
(function () {
  var hoy = new Date();
  var mes = hoy.toLocaleDateString("es-CO", { month: "short" }).replace(".", "").toUpperCase();
  document.getElementById("hero-cal-mes").textContent = mes;
  document.getElementById("hero-cal-dia").textContent = hoy.getDate();
})();
