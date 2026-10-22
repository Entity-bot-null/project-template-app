import { PRIVACY_EMAIL, SITE_NAME } from '../lib/site';
import type { Messages } from './messages';

export const es = {
  languageName: 'Español',
  skipToContent: 'Saltar al contenido',
  shareImageAlt: `${SITE_NAME}, junto a un teléfono que muestra la lista de elementos de la aplicación.`,
  header: {
    navigation: 'Principal',
    getApp: 'Descargar la aplicación',
  },
  home: {
    title: 'Tu producto, en el bolsillo',
    description:
      'Una aplicación móvil con cuentas, sesiones seguras y su propia API, lista para el App Store y Google Play desde la primera versión.',
    heading: ['Tu producto,', 'en el bolsillo.'],
    lead: 'Una aplicación móvil con cuentas, sesiones seguras y su propia API, lista para el App Store y Google Play desde la primera versión.',
    action: 'Descargar la aplicación',
    phone:
      'La aplicación en un teléfono: la lista de elementos, con un campo de búsqueda, un botón para añadir uno y los primeros elementos.',
  },
  capabilities: {
    heading: 'Qué hace',
    items: [
      {
        name: 'Una cuenta en un minuto',
        description: 'Regístrate con tu correo y confírmalo con un enlace que abre la aplicación.',
      },
      {
        name: 'Con la sesión segura',
        description:
          'Tu sesión vive en el almacenamiento seguro del teléfono, y todos los dispositivos se cierran cuando cambias la contraseña.',
      },
      {
        name: 'Tus datos, tu decisión',
        description:
          'Borra tu cuenta desde la aplicación cuando quieras, con todo lo que creaste en ella.',
      },
      {
        name: 'Para todas las manos',
        description:
          'Lectores de pantalla, texto grande y modo oscuro en todas las pantallas, con controles fáciles de pulsar.',
      },
      {
        name: 'Siempre al día',
        description:
          'Las correcciones llegan sin pasar por la tienda; cuando una versión se retira, la aplicación explica cómo actualizar.',
      },
      {
        name: 'Lista para equipos',
        description: 'Los administradores invitan a personas con un rol y ven quién tiene cuenta.',
      },
    ],
  },
  howItWorks: {
    heading: 'Cómo funciona',
    steps: [
      {
        name: 'Descarga la aplicación',
        description: 'Desde el App Store o Google Play.',
      },
      {
        name: 'Crea tu cuenta',
        description:
          'Regístrate con tu correo o acepta una invitación: el enlace del correo abre la aplicación.',
      },
      {
        name: 'Sigue donde estés',
        description: 'Tu sesión sigue abierta en el teléfono hasta que la cierres.',
      },
    ],
  },
  download: {
    heading: 'Descarga la aplicación',
    body: 'Para iPhone y teléfonos Android.',
    soon: 'Pronto en el App Store y Google Play.',
    appStore: 'Descárgala en el App Store',
    googlePlay: 'Disponible en Google Play',
  },
  callToAction: {
    heading: ['Llévala', 'contigo.'],
    body: 'Descarga la aplicación, crea tu cuenta y la tendrás lista donde estés.',
    action: 'Descargar la aplicación',
  },
  footer: {
    product: 'Producto',
    privacy: 'Privacidad',
    deleteAccount: 'Borrar tu cuenta',
    languages: 'Idiomas',
    rights: 'Todos los derechos reservados.',
    backToTop: 'Volver arriba',
  },
  notFound: {
    title: 'Página no encontrada',
    heading: ['Aquí no', 'hay nada.'],
    body: 'Puede que la dirección esté mal escrita o que la página se haya movido.',
    action: 'Ir a la página de inicio',
  },
  openInApp: {
    title: 'Abre este enlace en la aplicación',
    heading: ['Ábrelo en', 'la aplicación.'],
    lead: `Este enlace es para ${SITE_NAME}: se abre en la aplicación, en el teléfono donde la tienes instalada.`,
    steps: [
      'En tu teléfono, con la aplicación instalada, vuelve a abrir el enlace del correo: la aplicación se abre en la pantalla correcta.',
      '¿Aún no tienes la aplicación? Instálala y abre otra vez el enlace del correo.',
      '¿Estás en un ordenador? Abre el correo en tu teléfono: el enlace solo funciona en la aplicación.',
    ],
    action: 'Ir a la página de inicio',
  },
  privacy: {
    title: 'Privacidad',
    description: `Qué recoge ${SITE_NAME}, para qué, dónde se guarda y cómo borrarlo.`,
    heading: 'Privacidad',
    templateNotice:
      'Esta página es una plantilla. Sus secciones siguen los datos que la aplicación maneja de verdad; el texto legal, los proveedores y los plazos de conservación los escribe el proyecto antes de publicarla.',
    sections: [
      {
        heading: 'Qué cubre',
        paragraphs: [
          `Esta página explica qué recoge ${SITE_NAME}, para qué, dónde se guarda y cómo borrarlo, en la aplicación y en este sitio web.`,
        ],
      },
      {
        heading: 'Lo que nos das',
        paragraphs: [
          'Tu dirección de correo, tu nombre y tu contraseña al crear una cuenta. La contraseña solo se guarda como un hash de un solo sentido: nadie puede leerla.',
          'Lo que creas en la aplicación, y una dirección de correo nueva cuando pides cambiar la tuya.',
        ],
      },
      {
        heading: 'Lo que la aplicación envía con cada petición',
        paragraphs: [
          'La plataforma de tu teléfono y la versión y compilación de la aplicación, para que el servicio pueda pedir a una versión antigua que se actualice; y un identificador de petición aleatorio, para encontrar un fallo en los registros.',
        ],
      },
      {
        heading: 'Lo que se queda en tu teléfono',
        paragraphs: [
          'La clave que mantiene tu sesión abierta, en el almacenamiento seguro del teléfono (el llavero de iOS o el Keystore de Android), que se borra al cerrar sesión.',
          'Tus ajustes: el tema, si ya viste la introducción y tu decisión sobre la analítica de uso.',
        ],
      },
      {
        heading: 'Informes de errores y analítica de uso',
        paragraphs: [
          'Cuando los informes de errores están activados, llevan un identificador anónimo, el modelo y el sistema del dispositivo y lo que llevó al error: nunca tu correo, tu nombre ni lo que escribiste.',
          'La analítica de uso solo se envía después de que la aceptes en Ajustes, y puedes retirarla cuando quieras.',
        ],
      },
      {
        heading: 'Correos',
        paragraphs: [
          'Solo te escribimos sobre tu cuenta: enlaces para confirmar tu dirección o elegir una contraseña nueva, invitaciones y avisos cuando cambian tu contraseña o tu dirección o se borra tu cuenta.',
        ],
      },
      {
        heading: 'Quién más los trata',
        paragraphs: [
          'Los proveedores que hacen funcionar el servicio por nosotros: alojamiento, envío de correo y, si está activado, los informes de errores. Solo tratan los datos para prestar el servicio.',
        ],
      },
      {
        heading: 'Cuánto tiempo los guardamos',
        paragraphs: [
          'Tu cuenta y lo que creaste, hasta que los borres. Las sesiones, hasta que caducan. Los registros de los correos que te enviamos guardan una forma codificada de la dirección, nunca la dirección, durante 30 días.',
          'Las copias de seguridad de la base de datos guardan una copia hasta que rotan; después no queda nada de una cuenta borrada.',
        ],
      },
      {
        heading: 'Tus opciones',
        paragraphs: [
          'En la aplicación puedes cambiar tu correo y tu contraseña y retirar la analítica de uso. Puedes borrar tu cuenta y todo lo que contiene, desde la aplicación o por correo.',
          `Preguntas sobre tus datos: ${PRIVACY_EMAIL}.`,
        ],
      },
    ],
  },
  deleteAccount: {
    title: 'Borrar tu cuenta',
    description: `Cómo borrar tu cuenta de ${SITE_NAME} y todo lo que contiene, desde la aplicación o por correo.`,
    heading: 'Borrar tu cuenta',
    lead: 'Puedes borrar tu cuenta cuando quieras. Se borra para siempre, con todo lo que creaste en ella.',
    inApp: {
      heading: 'Desde la aplicación',
      steps: [
        'Abre la aplicación e inicia sesión.',
        'Ve a Ajustes y después a Borrar la cuenta.',
        'Escribe tu contraseña y confirma. La cuenta se borra al momento, y se cierra la sesión en todos los dispositivos.',
      ],
    },
    byEmail: {
      heading: 'Sin la aplicación',
      body: `Si no puedes usar la aplicación, escribe a ${PRIVACY_EMAIL} desde la dirección de tu cuenta. Te respondemos para confirmar que la petición es tuya y después borramos la cuenta.`,
      subject: 'Borrar mi cuenta',
    },
    deleted: {
      heading: 'Qué se borra',
      paragraphs: [
        'Tu perfil (correo, nombre y contraseña), lo que creaste en la aplicación, tus sesiones y los enlaces pendientes.',
        'Al terminar, enviamos un aviso a tu dirección.',
      ],
    },
    kept: {
      heading: 'Qué se guarda, y cuánto tiempo',
      paragraphs: [
        'Las copias de seguridad de la base de datos guardan una copia hasta que rotan; después no queda nada de la cuenta.',
        'Los registros de los correos que te enviamos guardan una forma codificada de la dirección, nunca la dirección, durante 30 días.',
      ],
    },
  },
} as const satisfies Messages;
