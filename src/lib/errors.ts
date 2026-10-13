/** Traduce errores de Firebase a mensajes humanos sin exponer detalles internos. */
export function humanizeFirebaseError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''

  switch (code) {
    case 'auth/invalid-email':
      return 'El correo no es válido. Revisa que esté bien escrito.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Correo o contraseña incorrectos. Revisa los datos o recupera tu contraseña.'
    case 'auth/email-already-in-use':
      return 'Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.'
    case 'auth/weak-password':
      return 'La contraseña es muy débil. Usa al menos 8 caracteres con letras y números.'
    case 'auth/user-disabled':
      return 'Esta cuenta está deshabilitada. Contacta a quien administra el proyecto de Firebase.'
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.'
    case 'auth/network-request-failed':
    case 'unavailable':
      return 'No hay conexión con el servidor. Revisa tu internet y vuelve a intentarlo.'
    case 'auth/operation-not-allowed':
      return 'El acceso con correo y contraseña no está activado en Firebase. Actívalo en Authentication > Método de acceso.'
    case 'auth/unauthorized-domain':
      return 'Este dominio no está autorizado en Firebase. Agrégalo en Authentication > Configuración > Dominios autorizados.'
    case 'auth/requires-recent-login':
      return 'Por seguridad, vuelve a iniciar sesión para hacer este cambio.'
    case 'permission-denied':
    case 'firestore/permission-denied':
      return 'No tienes permiso para esta operación. Si crees que es un error, vuelve a iniciar sesión.'
    case 'resource-exhausted':
      return 'Se alcanzó el límite de uso de Firebase por hoy. Inténtalo más tarde o revisa tu cuota.'
    default:
      return 'Ocurrió un problema inesperado. Inténtalo de nuevo; si continúa, recarga la página.'
  }
}
