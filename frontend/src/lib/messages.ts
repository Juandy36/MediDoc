// Mensajes legibles para los códigos de error de la API.
const MESSAGES: Record<string, string> = {
  invalid_input: "Revisa los datos del formulario.",
  invalid_json: "Revisa los datos del formulario.",
  not_found: "No existe o no tienes acceso.",
  forbidden: "No tienes permiso para hacer esto.",
  last_owner: "Debe quedar al menos un propietario.",
  has_documents: "Primero elimina sus documentos.",
  already_member: "Esa persona ya tiene acceso.",
  self_invite: "No puedes invitarte a ti mismo.",
  bad_origin: "Petición rechazada por seguridad. Recarga la página.",
  network: "No hay conexión con el servidor.",
};

export const errorMessage = (code: string | null | undefined) =>
  code ? (MESSAGES[code] ?? "Ocurrió un error. Inténtalo de nuevo.") : null;
