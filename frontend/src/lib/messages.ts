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
  file_type: "Solo se permiten archivos PDF, JPG o PNG.",
  file_too_large: "El archivo supera los 15 MB.",
  file_missing: "Elige un archivo.",
  upload_missing: "La subida no se completó. Inténtalo de nuevo.",
  upload_failed: "No se pudo subir el archivo. Revisa tu conexión.",
  internal_error: "Error del servidor. Inténtalo más tarde.",
};

export const errorMessage = (code: string | null | undefined) =>
  code ? (MESSAGES[code] ?? "Ocurrió un error. Inténtalo de nuevo.") : null;
