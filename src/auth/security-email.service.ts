import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type EmailDeliveryResult = {
  sent: boolean;
  error?: string;
};

type VerificationEmailInput = {
  to: string;
  name: string;
  verificationUrl: string;
  expiresInMinutes: number;
};

type ApprovalEmailInput = {
  to: string;
  name: string;
  role: 'ADMIN' | 'VENDEDOR' | 'COBRADOR';
  loginUrl: string;
};

type RejectionEmailInput = {
  to: string;
  name: string;
  reason: string;
};

type PasswordResetEmailInput = {
  to: string;
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
};

type SimpleSecurityEmailInput = {
  to: string;
  name: string;
};

@Injectable()
export class SecurityEmailService {
  private readonly logger = new Logger(SecurityEmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendVerificationEmail(
    input: VerificationEmailInput,
  ): Promise<EmailDeliveryResult> {
    const safeName = this.escapeHtml(input.name);
    const safeUrl = this.escapeHtml(input.verificationUrl);

    return this.send({
      to: input.to,
      subject: 'Verifica tu correo — Yungas Distribuidora',
      text: [
        `Hola ${input.name},`,
        '',
        'Recibimos una solicitud para crear una cuenta en Yungas Distribuidora.',
        `Verifica tu correo abriendo este enlace: ${input.verificationUrl}`,
        '',
        `El enlace caduca en ${input.expiresInMinutes} minutos.`,
        'Después de verificarlo, la solicitud quedará pendiente de aprobación administrativa.',
        '',
        'Si no solicitaste esta cuenta, puedes ignorar este mensaje.',
      ].join('\n'),
      html: this.layout(`
        <h1 style="margin:0 0 12px;font-size:24px;color:#0b1f33;">Verifica tu correo electrónico</h1>
        <p style="margin:0 0 16px;color:#344054;line-height:1.6;">Hola <strong>${safeName}</strong>,</p>
        <p style="margin:0 0 20px;color:#344054;line-height:1.6;">
          Recibimos una solicitud para crear una cuenta en
          <strong>Yungas Distribuidora</strong>.
        </p>
        <p style="margin:0 0 24px;text-align:center;">
          <a href="${safeUrl}" style="display:inline-block;background:#0b6b46;color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:8px;font-weight:700;">
            Verificar mi correo
          </a>
        </p>
        <p style="margin:0 0 14px;color:#475467;line-height:1.6;">
          Este enlace caduca en <strong>${input.expiresInMinutes} minutos</strong>.
          Después de verificarlo, tu solicitud quedará pendiente de aprobación por un administrador.
        </p>
        <p style="margin:0 0 8px;color:#667085;font-size:13px;line-height:1.5;">
          Si el botón no funciona, copia y pega este enlace en tu navegador:
        </p>
        <p style="margin:0 0 18px;word-break:break-all;font-size:12px;line-height:1.5;">
          <a href="${safeUrl}" style="color:#175cd3;">${safeUrl}</a>
        </p>
        <p style="margin:0;color:#667085;font-size:13px;line-height:1.5;">
          Si no solicitaste esta cuenta, puedes ignorar este mensaje.
        </p>
      `),
    });
  }

  async sendApprovalEmail(
    input: ApprovalEmailInput,
  ): Promise<EmailDeliveryResult> {
    const safeName = this.escapeHtml(input.name);
    const safeUrl = this.escapeHtml(input.loginUrl);
    const roleLabel = this.roleLabel(input.role);

    return this.send({
      to: input.to,
      subject: 'Tu acceso fue aprobado — Yungas Distribuidora',
      text: [
        `Hola ${input.name},`,
        '',
        'El administrador aprobó tu acceso al sistema de Yungas Distribuidora.',
        `Rol asignado: ${roleLabel}.`,
        `Ingresa al sistema desde: ${input.loginUrl}`,
        '',
        'En tu primer ingreso deberás configurar la verificación en dos pasos.',
      ].join('\n'),
      html: this.layout(`
        <h1 style="margin:0 0 12px;font-size:24px;color:#0b1f33;">Tu acceso fue aprobado</h1>
        <p style="margin:0 0 16px;color:#344054;line-height:1.6;">Hola <strong>${safeName}</strong>,</p>
        <p style="margin:0 0 16px;color:#344054;line-height:1.6;">
          El administrador aprobó tu acceso al sistema de
          <strong>Yungas Distribuidora</strong>.
        </p>
        <div style="margin:0 0 22px;padding:14px 16px;background:#ecfdf3;border:1px solid #abefc6;border-radius:8px;color:#067647;">
          Rol asignado: <strong>${roleLabel}</strong>
        </div>
        <p style="margin:0 0 24px;text-align:center;">
          <a href="${safeUrl}" style="display:inline-block;background:#175cd3;color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:8px;font-weight:700;">
            Ingresar al sistema
          </a>
        </p>
        <p style="margin:0 0 12px;color:#475467;line-height:1.6;">
          En tu primer ingreso deberás configurar la verificación en dos pasos con una aplicación autenticadora.
        </p>
        <p style="margin:0;color:#667085;font-size:13px;line-height:1.5;">
          Este sistema es de uso privado. No compartas tu contraseña ni tus códigos de recuperación.
        </p>
      `),
    });
  }

  async sendRejectionEmail(
    input: RejectionEmailInput,
  ): Promise<EmailDeliveryResult> {
    const safeName = this.escapeHtml(input.name);
    const safeReason = this.escapeHtml(input.reason);

    return this.send({
      to: input.to,
      subject: 'Resultado de tu solicitud — Yungas Distribuidora',
      text: [
        `Hola ${input.name},`,
        '',
        'Tu solicitud de acceso no fue aprobada.',
        `Motivo: ${input.reason}`,
        '',
        'Comunícate con el administrador si necesitas una revisión.',
      ].join('\n'),
      html: this.layout(`
        <h1 style="margin:0 0 12px;font-size:24px;color:#0b1f33;">Solicitud no aprobada</h1>
        <p style="margin:0 0 16px;color:#344054;line-height:1.6;">Hola <strong>${safeName}</strong>,</p>
        <p style="margin:0 0 16px;color:#344054;line-height:1.6;">
          El administrador revisó tu solicitud de acceso y no fue aprobada.
        </p>
        <div style="margin:0 0 18px;padding:14px 16px;background:#fef3f2;border:1px solid #fecdca;border-radius:8px;color:#b42318;">
          Motivo: <strong>${safeReason}</strong>
        </div>
        <p style="margin:0;color:#667085;font-size:13px;line-height:1.5;">
          Comunícate con el administrador si consideras que la solicitud debe revisarse nuevamente.
        </p>
      `),
    });
  }

  async sendPasswordResetEmail(
    input: PasswordResetEmailInput,
  ): Promise<EmailDeliveryResult> {
    const safeName = this.escapeHtml(input.name);
    const safeUrl = this.escapeHtml(input.resetUrl);

    return this.send({
      to: input.to,
      subject: 'Recupera tu contraseña — Yungas Distribuidora',
      text: [
        `Hola ${input.name},`,
        '',
        `Crea una nueva contraseña desde: ${input.resetUrl}`,
        `El enlace caduca en ${input.expiresInMinutes} minutos.`,
        '',
        'Si no solicitaste el cambio, ignora este mensaje.',
      ].join('\n'),
      html: this.layout(`
        <h1 style="margin:0 0 12px;font-size:24px;color:#0b1f33;">Recupera tu contraseña</h1>
        <p style="margin:0 0 16px;color:#344054;line-height:1.6;">Hola <strong>${safeName}</strong>,</p>
        <p style="margin:0 0 22px;color:#344054;line-height:1.6;">
          Recibimos una solicitud para cambiar la contraseña de tu cuenta.
        </p>
        <p style="margin:0 0 24px;text-align:center;">
          <a href="${safeUrl}" style="display:inline-block;background:#175cd3;color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:8px;font-weight:700;">
            Crear nueva contraseña
          </a>
        </p>
        <p style="margin:0 0 12px;color:#475467;line-height:1.6;">
          Este enlace caduca en <strong>${input.expiresInMinutes} minutos</strong> y solo puede utilizarse una vez.
        </p>
        <p style="margin:0;color:#667085;font-size:13px;line-height:1.5;">
          Si no solicitaste el cambio, ignora este mensaje y conserva tu contraseña actual.
        </p>
      `),
    });
  }

  async sendPasswordChangedEmail(
    input: SimpleSecurityEmailInput,
  ): Promise<EmailDeliveryResult> {
    const safeName = this.escapeHtml(input.name);
    return this.send({
      to: input.to,
      subject: 'Tu contraseña fue modificada — Yungas Distribuidora',
      text: [
        `Hola ${input.name},`,
        '',
        'La contraseña de tu cuenta fue modificada y todas las sesiones fueron cerradas.',
        'Si no realizaste este cambio, comunícate inmediatamente con el administrador.',
      ].join('\n'),
      html: this.layout(`
        <h1 style="margin:0 0 12px;font-size:24px;color:#0b1f33;">Contraseña modificada</h1>
        <p style="margin:0 0 16px;color:#344054;line-height:1.6;">Hola <strong>${safeName}</strong>,</p>
        <p style="margin:0 0 16px;color:#344054;line-height:1.6;">
          La contraseña de tu cuenta fue modificada y todas las sesiones abiertas fueron cerradas.
        </p>
        <div style="padding:14px 16px;background:#fffaeb;border:1px solid #fedf89;border-radius:8px;color:#b54708;">
          Si no realizaste este cambio, comunícate inmediatamente con el administrador.
        </div>
      `),
    });
  }

  async sendTwoFactorResetEmail(
    input: SimpleSecurityEmailInput,
  ): Promise<EmailDeliveryResult> {
    const safeName = this.escapeHtml(input.name);
    return this.send({
      to: input.to,
      subject: 'Tu segundo factor fue restablecido — Yungas Distribuidora',
      text: [
        `Hola ${input.name},`,
        '',
        'El administrador restableció tu verificación en dos pasos.',
        'En tu siguiente inicio de sesión deberás configurarla nuevamente.',
      ].join('\n'),
      html: this.layout(`
        <h1 style="margin:0 0 12px;font-size:24px;color:#0b1f33;">Segundo factor restablecido</h1>
        <p style="margin:0 0 16px;color:#344054;line-height:1.6;">Hola <strong>${safeName}</strong>,</p>
        <p style="margin:0 0 12px;color:#344054;line-height:1.6;">
          El administrador restableció tu verificación en dos pasos y cerró tus sesiones activas.
        </p>
        <p style="margin:0;color:#667085;font-size:13px;line-height:1.5;">
          En tu siguiente inicio de sesión deberás configurar nuevamente tu aplicación autenticadora.
        </p>
      `),
    });
  }

  private async send(input: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<EmailDeliveryResult> {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();

    if (!apiKey) {
      const error = 'RESEND_API_KEY no está configurado';
      this.logger.warn(error);
      return { sent: false, error };
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromAddress(),
          to: [input.to],
          subject: input.subject,
          text: input.text,
          html: input.html,
        }),
      });

      if (response.ok) return { sent: true };

      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        name?: string;
      } | null;
      const error =
        payload?.message ||
        payload?.name ||
        `Resend respondió con el estado ${response.status}`;

      this.logger.error(`No se pudo enviar correo a ${input.to}: ${error}`);
      return { sent: false, error };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error de red desconocido';
      this.logger.error(`No se pudo enviar correo a ${input.to}: ${message}`);
      return { sent: false, error: message };
    }
  }

  private fromAddress() {
    const configuredSender =
      this.config.get<string>('RESEND_FROM_EMAIL')?.trim() ||
      this.config.get<string>('EMAIL_FROM')?.trim();

    if (!configuredSender) {
      return 'Yungas Distribuidora <onboarding@resend.dev>';
    }

    // Permite configurar solo el correo en .env y conserva un nombre legible
    // en la bandeja de entrada. También acepta el formato "Nombre <correo>".
    return configuredSender.includes('<')
      ? configuredSender
      : `Yungas Distribuidora <${configuredSender}>`;
  }

  private layout(content: string) {
    return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Yungas Distribuidora</title>
  </head>
  <body style="margin:0;padding:0;background:#f2f4f7;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f4f7;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #eaecf0;">
            <tr>
              <td style="background:#074f3b;padding:20px 28px;color:#ffffff;font-size:20px;font-weight:700;">
                Yungas Distribuidora
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px;">
                ${content}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#f9fafb;color:#667085;font-size:12px;line-height:1.5;">
                Mensaje automático del sistema de ventas e inventarios de Yungas Distribuidora.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  private roleLabel(role: ApprovalEmailInput['role']) {
    const labels: Record<ApprovalEmailInput['role'], string> = {
      ADMIN: 'Administrador',
      VENDEDOR: 'Vendedor',
      COBRADOR: 'Cobrador',
    };
    return labels[role];
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>'"]/g, (character) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      };
      return entities[character];
    });
  }
}
