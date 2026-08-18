import type { Locale } from '@/i18n/config';

// Customer-facing order stages (mapped from op_status). Kept intentionally simple.
export const CUSTOMER_STATUS: Record<string, Record<Locale, string>> = {
  received:   { de:'Bestellung eingegangen', en:'Order received',      fr:'Commande reçue' },
  design:     { de:'Designabstimmung / Freigabe', en:'Design review / approval', fr:'Validation du design' },
  production: { de:'In Produktion',          en:'In production',       fr:'En production' },
  shipped:    { de:'Versendet',              en:'Shipped',             fr:'Expédiée' },
};
export const STATUS_ORDER = ['received','design','production','shipped'] as const;

export const APPROVAL_COPY: Record<Locale, { pendingTitle: string; pendingBody: string; approved: string; revision: string }> = {
  de: { pendingTitle:'Keine Produktion ohne Ihre Freigabe.',
    pendingBody:'Nach Ihrer Bestellung kontaktieren wir Sie persönlich per E-Mail oder WhatsApp. Sie erhalten Ihren finalen Entwurf zur Prüfung. Erst nach Ihrer ausdrücklichen Freigabe starten wir die Produktion.',
    approved:'Ihre Freigabe wurde erfasst – die Produktion kann starten.', revision:'Änderung angefragt – wir stimmen den Entwurf erneut mit Ihnen ab.' },
  en: { pendingTitle:'No production without your approval.',
    pendingBody:'After your order we contact you personally by email or WhatsApp. You receive your final proof to review. Production starts only after your explicit approval.',
    approved:'Your approval has been recorded – production can start.', revision:'Revision requested – we’ll align the design with you again.' },
  fr: { pendingTitle:'Aucune production sans votre validation.',
    pendingBody:'Après votre commande, nous vous contactons personnellement par e-mail ou WhatsApp. Vous recevez votre BAT final à vérifier. La production ne commence qu’après votre validation explicite.',
    approved:'Votre validation a été enregistrée – la production peut commencer.', revision:'Révision demandée – nous ajustons le design avec vous.' },
};

export const ACCOUNT_COPY: Record<Locale, Record<string, string>> = {
  de: { account:'Mein Konto', orders:'Meine Bestellungen', saved:'Gespeicherte Entwürfe', quotes:'Meine Angebote',
    profile:'Profil', logout:'Abmelden', login:'Anmelden', register:'Registrieren', email:'E-Mail', password:'Passwort',
    company:'Firma', name:'Name', forgot:'Passwort vergessen?', reset:'Passwort zurücksetzen', send:'Senden',
    noOrders:'Noch keine Bestellungen.', orderNo:'Bestellnummer', date:'Datum', total:'Summe', status:'Status',
    detail:'Details ansehen', track:'Sendung verfolgen', reorder:'Erneut bestellen', quantity:'Menge',
    verifyTitle:'Bitte bestätigen Sie Ihre E-Mail', verifyBody:'Wir haben Ihnen einen Bestätigungslink gesendet. Nach der Bestätigung können Sie sich anmelden.',
    resendVerify:'Bestätigung erneut senden', haveAccount:'Bereits ein Konto?', noAccount:'Noch kein Konto?',
    checkInbox:'Falls die E-Mail existiert, haben wir einen Link zum Zurücksetzen gesendet.', newPassword:'Neues Passwort',
    guestNote:'Ein Konto ist optional – Sie können auch als Gast bestellen.', continueDraft:'Fortsetzen',
    reorderBusy:'Wird vorbereitet …', reorderError:'Erneute Bestellung konnte nicht vorbereitet werden. Bitte versuchen Sie es erneut.',
    reorderHint:'Gleiche Konfiguration und Druckdaten wie zuvor – kein erneuter Upload nötig.', startNew:'Jetzt gestalten' },
  en: { account:'My account', orders:'My orders', saved:'Saved drafts', quotes:'My quotes',
    profile:'Profile', logout:'Log out', login:'Log in', register:'Register', email:'Email', password:'Password',
    company:'Company', name:'Name', forgot:'Forgot password?', reset:'Reset password', send:'Send',
    noOrders:'No orders yet.', orderNo:'Order number', date:'Date', total:'Total', status:'Status',
    detail:'View details', track:'Track shipment', reorder:'Order again', quantity:'Quantity',
    verifyTitle:'Please confirm your email', verifyBody:'We’ve sent you a confirmation link. After confirming you can log in.',
    resendVerify:'Resend confirmation', haveAccount:'Already have an account?', noAccount:'No account yet?',
    checkInbox:'If the email exists, we’ve sent a reset link.', newPassword:'New password',
    guestNote:'An account is optional – you can also order as a guest.', continueDraft:'Continue',
    reorderBusy:'Preparing …', reorderError:'Could not prepare the reorder. Please try again.',
    reorderHint:'Same configuration and artwork as before – no need to upload again.', startNew:'Start designing' },
  fr: { account:'Mon compte', orders:'Mes commandes', saved:'Brouillons enregistrés', quotes:'Mes devis',
    profile:'Profil', logout:'Se déconnecter', login:'Se connecter', register:'S’inscrire', email:'E-mail', password:'Mot de passe',
    company:'Société', name:'Nom', forgot:'Mot de passe oublié ?', reset:'Réinitialiser le mot de passe', send:'Envoyer',
    noOrders:'Aucune commande.', orderNo:'N° de commande', date:'Date', total:'Total', status:'Statut',
    detail:'Voir les détails', track:'Suivre l’envoi', reorder:'Commander à nouveau', quantity:'Quantité',
    verifyTitle:'Veuillez confirmer votre e-mail', verifyBody:'Nous vous avons envoyé un lien de confirmation. Après confirmation, vous pourrez vous connecter.',
    resendVerify:'Renvoyer la confirmation', haveAccount:'Déjà un compte ?', noAccount:'Pas encore de compte ?',
    checkInbox:'Si l’e-mail existe, nous avons envoyé un lien de réinitialisation.', newPassword:'Nouveau mot de passe',
    guestNote:'Le compte est optionnel – vous pouvez aussi commander en tant qu’invité.', continueDraft:'Continuer',
    reorderBusy:'Préparation …', reorderError:'La nouvelle commande n’a pas pu être préparée. Veuillez réessayer.',
    reorderHint:'Même configuration et mêmes fichiers qu’auparavant – aucun nouvel envoi nécessaire.', startNew:'Créer un design' },
};

// Known-carrier tracking URL derivation. Never invents a URL for unknown carriers.
export function trackingUrl(carrier: string | null, tracking: string | null): string | null {
  if (!carrier || !tracking) return null;
  const c = carrier.toLowerCase();
  const t = encodeURIComponent(tracking);
  if (c.includes('dhl')) return `https://www.dhl.com/de-en/home/tracking.html?tracking-id=${t}`;
  if (c.includes('dpd')) return `https://tracking.dpd.de/status/en_US/parcel/${t}`;
  if (c.includes('gls')) return `https://gls-group.com/track?match=${t}`;
  if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${t}`;
  if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${t}`;
  return null;   // unknown carrier → show number only
}
