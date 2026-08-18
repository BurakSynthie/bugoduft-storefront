import type { CollectionSeed } from '../types';
export const collections: CollectionSeed[] = [
  { code:'STANDARD', groupId:'col-standard', isActive:true, sortOrder:1, tr:{
    de:{ name:'Standard', slug:'standard', description:'Der bewährte Werbeduftanhänger für hohe Auflagen.',
         seo:{ title:'Standard Duftanhänger bedrucken | BUGO DUFT', description:'Individuelle Standard-Werbeduftanhänger ab 1.000 Stück – Ihr Logo, Ihr Duft.' } },
    en:{ name:'Standard', slug:'standard', description:'The proven promotional air freshener for high volumes.',
         seo:{ title:'Custom Standard Air Fresheners | BUGO DUFT', description:'Custom standard promotional air fresheners from 1,000 units – your logo, your scent.' } },
    fr:{ name:'Standard', slug:'standard', description:'Le désodorisant publicitaire éprouvé pour les grands volumes.',
         seo:{ title:'Désodorisants Standard personnalisés | BUGO DUFT', description:'Désodorisants publicitaires standard dès 1 000 pièces – votre logo, votre parfum.' } } } },
  { code:'PREMIUM', groupId:'col-premium', isActive:true, sortOrder:2, tr:{
    de:{ name:'Premium', slug:'premium', description:'Höhere Materialqualität und intensivere Duftveredelung.',
         seo:{ title:'Premium Duftanhänger | BUGO DUFT', description:'Premium-Werbeduftanhänger mit intensiver Duftveredelung ab 1.000 Stück.' } },
    en:{ name:'Premium', slug:'premium', description:'Higher material quality and more intense scent finishing.',
         seo:{ title:'Premium Air Fresheners | BUGO DUFT', description:'Premium promotional air fresheners with intense scent finishing from 1,000 units.' } },
    fr:{ name:'Premium', slug:'premium', description:'Qualité de matériau supérieure et parfum plus intense.',
         seo:{ title:'Désodorisants Premium | BUGO DUFT', description:'Désodorisants publicitaires premium au parfum intense dès 1 000 pièces.' } } } },
  { code:'DELUXE', groupId:'col-deluxe', isActive:true, sortOrder:3, tr:{
    de:{ name:'Deluxe', slug:'deluxe', description:'Gehobene Anmutung für anspruchsvolle Marken.',
         seo:{ title:'Deluxe Duftanhänger | BUGO DUFT', description:'Deluxe-Werbeduftanhänger mit gehobener Anmutung ab 1.000 Stück.' } },
    en:{ name:'Deluxe', slug:'deluxe', description:'Elevated feel for demanding brands.',
         seo:{ title:'Deluxe Air Fresheners | BUGO DUFT', description:'Deluxe promotional air fresheners with an elevated feel from 1,000 units.' } },
    fr:{ name:'Deluxe', slug:'deluxe', description:'Un rendu haut de gamme pour les marques exigeantes.',
         seo:{ title:'Désodorisants Deluxe | BUGO DUFT', description:'Désodorisants publicitaires deluxe haut de gamme dès 1 000 pièces.' } } } },
  { code:'VIP', groupId:'col-vip', isActive:true, sortOrder:4, tr:{
    de:{ name:'VIP', slug:'vip', description:'Das Premiumsegment mit der größten Duftauswahl.',
         seo:{ title:'VIP Duftanhänger | BUGO DUFT', description:'VIP-Werbeduftanhänger im Premiumsegment mit größter Duftauswahl ab 1.000 Stück.' } },
    en:{ name:'VIP', slug:'vip', description:'The premium tier with the widest scent selection.',
         seo:{ title:'VIP Air Fresheners | BUGO DUFT', description:'VIP promotional air fresheners – premium tier, widest scent selection, from 1,000 units.' } },
    fr:{ name:'VIP', slug:'vip', description:'Le segment premium avec le plus grand choix de parfums.',
         seo:{ title:'Désodorisants VIP | BUGO DUFT', description:'Désodorisants publicitaires VIP – segment premium, plus grand choix de parfums, dès 1 000 pièces.' } } } },
];
