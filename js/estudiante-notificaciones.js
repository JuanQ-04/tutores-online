// js/estudiante-notificaciones.js
// Interfaz de demostración, sin Firebase.

(() => {
  const widget = document.getElementById("notifications-widget");
  const toggle = document.getElementById("notifications-toggle");
  const dropdown = document.getElementById("notifications-dropdown");
  const viewAll = document.getElementById("notifications-view-all");
  const back = document.getElementById("notifications-back");
  const notificationSection = document.getElementById("notificaciones");
  const main = document.getElementById("contenido-principal");
  const breadcrumb = document.querySelector(
    '.breadcrumb > [aria-current="page"]'
  );

  if (
    !widget || !toggle || !dropdown || !viewAll ||
    !back || !notificationSection || !main
  ) {
    return;
  }

  // Solo las secciones principales, no sus secciones internas.
  const sections = [...main.children].filter(
    (element) => element.tagName === "SECTION"
  );

  const navigationLinks = [
    ...document.querySelectorAll(".main-navigation > a")
  ];

  let previousSection = sections.find(
    (section) => section !== notificationSection && !section.hidden
  ) || document.getElementById("inicio");

  let savedNavigation = [];
  let savedBreadcrumb = breadcrumb?.textContent || "";
  let savedTitle = document.title;
  let historyIsOpen = false;

  function closeDropdown(returnFocus = false) {
    dropdown.hidden = true;
    toggle.setAttribute("aria-expanded", "false");

    if (returnFocus) {
      toggle.focus();
    }
  }

  function openHistory() {
    if (!historyIsOpen) {
      previousSection = sections.find(
        (section) => section !== notificationSection && !section.hidden
      ) || previousSection;

      savedNavigation = navigationLinks.map(
        (link) => link.getAttribute("aria-current")
      );

      savedBreadcrumb = breadcrumb?.textContent || "";
      savedTitle = document.title;
    }

    closeDropdown();

    sections.forEach((section) => {
      section.hidden = section !== notificationSection;
    });

    navigationLinks.forEach((link) => {
      link.removeAttribute("aria-current");
    });

    if (breadcrumb) {
      breadcrumb.textContent = "Notificaciones";
    }

    document.title = "Notificaciones | TutoresOn-Line";
    historyIsOpen = true;

    document.getElementById("notifications-title").focus();
  }

  function leaveHistory(target) {
    sections.forEach((section) => {
      section.hidden = section !== target;
    });

    navigationLinks.forEach((link, index) => {
      link.removeAttribute("aria-current");

      if (target === previousSection) {
        if (savedNavigation[index]) {
          link.setAttribute("aria-current", savedNavigation[index]);
        }
      } else if (link.getAttribute("href") === `#${target.id}`) {
        link.setAttribute("aria-current", "page");
      }
    });

    const targetLink = navigationLinks.find(
      (link) => link.getAttribute("href") === `#${target.id}`
    );

    if (breadcrumb) {
      breadcrumb.textContent = target === previousSection
        ? savedBreadcrumb
        : targetLink?.textContent.trim() || "Inicio";
    }

    document.title = savedTitle;
    historyIsOpen = false;
  }

  toggle.addEventListener("click", () => {
    const willOpen = dropdown.hidden;

    dropdown.hidden = !willOpen;
    toggle.setAttribute("aria-expanded", String(willOpen));
  });

  document.addEventListener("click", (event) => {
    if (!widget.contains(event.target)) {
      closeDropdown();
    }
  });

  document.addEventListener("focusin", (event) => {
    if (!widget.contains(event.target)) {
      closeDropdown();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dropdown.hidden) {
      closeDropdown(true);
    }
  });

  viewAll.addEventListener("click", (event) => {
    event.preventDefault();

    if (window.location.hash === "#notificaciones") {
      openHistory();
    } else {
      window.location.hash = "notificaciones";
    }
  });

  back.addEventListener("click", () => {
    if (!previousSection) {
      return;
    }

    // Recupera la pantalla que estaba visible antes del historial.
    leaveHistory(previousSection);
    window.location.hash = previousSection.id;
    toggle.focus();
  });

  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#notificaciones") {
      openHistory();
      return;
    }

    // Al salir del historial, permite volver a una sección existente.
    // La navegación general del panel se implementará por separado.
    if (historyIsOpen) {
      const target = sections.find(
        (section) => `#${section.id}` === window.location.hash
      );

      leaveHistory(target || previousSection);
    }
  });

  if (window.location.hash === "#notificaciones") {
    openHistory();
  }
})();