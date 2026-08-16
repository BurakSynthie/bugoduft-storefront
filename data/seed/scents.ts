import type { ScentSeed } from '../types';
const s = (code:string, category:ScentSeed['category'], de:[string,string], en:[string,string], fr:[string,string]):ScentSeed => ({
  code, category, isActive:true,
  tr:{ de:{name:de[0],description:de[1]}, en:{name:en[0],description:en[1]}, fr:{name:fr[0],description:fr[1]} }
});
export const scents: ScentSeed[] = [
  s('frisch-ocean','frisch',['Ocean Breeze','Frisch, maritim, klar'],['Ocean Breeze','Fresh, marine, clean'],['Brise Océane','Frais, marin, net']),
  s('frisch-cotton','frisch',['Cotton Fresh','Sauber, weich, dezent'],['Cotton Fresh','Clean, soft, subtle'],['Coton Frais','Propre, doux, discret']),
  s('fruchtig-apple','fruchtig',['Green Apple','Spritzig, fruchtig'],['Green Apple','Zesty, fruity'],['Pomme Verte','Pétillant, fruité']),
  s('fruchtig-cherry','fruchtig',['Black Cherry','Saftig, süßlich'],['Black Cherry','Juicy, sweetish'],['Cerise Noire','Juteux, sucré']),
  s('fruchtig-mango','fruchtig',['Mango','Exotisch, fruchtig'],['Mango','Exotic, fruity'],['Mangue','Exotique, fruité']),
  s('suess-vanilla','suess',['Vanilla','Warm, süß, cremig'],['Vanilla','Warm, sweet, creamy'],['Vanille','Chaud, sucré, crémeux']),
  s('suess-caramel','suess',['Caramel','Süß, gebrannt'],['Caramel','Sweet, toasted'],['Caramel','Sucré, torréfié']),
  s('elegant-black','elegant',['Black Edition','Elegant, herb'],['Black Edition','Elegant, dry'],['Black Edition','Élégant, sec']),
  s('elegant-oud','elegant',['Oud Noir','Warm, holzig, edel'],['Oud Noir','Warm, woody, refined'],['Oud Noir','Chaud, boisé, raffiné']),
  s('intensiv-espresso','intensiv',['Espresso','Intensiv, röstig'],['Espresso','Intense, roasty'],['Espresso','Intense, torréfié']),
];
