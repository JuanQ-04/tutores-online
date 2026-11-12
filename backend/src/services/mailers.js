import nodemailer from "nodemailer";

// Puerto "Mailer": enviar({ para, asunto, html, texto })

export class SmtpMailer {
  constructor({ host, puerto, seguro, usuario, clave, remitente }) {
    this.remitente = remitente;
    this.transporte = nodemailer.createTransport({
      host,
      port: puerto,
      secure: seguro,
      auth: usuario ? { user: usuario, pass: clave } : undefined
    });
  }

  async enviar({ para, asunto, html, texto }) {
    await this.transporte.sendMail({ from: this.remitente, to: para, subject: asunto, html, text: texto });
  }
}

// Sin SMTP configurado: imprime el correo en consola (útil para desarrollar y demostrar).
export class ConsolaMailer {
  async enviar({ para, asunto, texto }) {
    console.log(`\n[correo simulado] Para: ${para}\nAsunto: ${asunto}\n${texto}\n`);
  }
}
