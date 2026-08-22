// §1 artwork upload hardening tests. PURE — run with: tsx lib/checkout/artwork-validation.test.ts
import { validateArtworkFile, validateArtworkFields, isValidField, isPathUnderConfig,
  ARTWORK_MAX_BYTES, ARTWORK_MAX_FILES } from './artwork-validation';

let failures = 0;
function expect(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  // eslint-disable-next-line no-console
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}
const ok = (r: any) => r.ok === true;
const reason = (r: any) => r.ok === false ? r.reason : null;

// ---- valid front/back/supporting accepted ----
expect('front pdf accepted', ok(validateArtworkFile({ field:'front', name:'logo.pdf', type:'application/pdf', size:1000 })), true);
expect('back svg accepted', ok(validateArtworkFile({ field:'back', name:'art.svg', type:'image/svg+xml', size:2000 })), true);
expect('supporting-0 png accepted', ok(validateArtworkFile({ field:'supporting-0', name:'x.png', type:'image/png', size:2000 })), true);
expect('AI with empty mime accepted (browser sends generic)', ok(validateArtworkFile({ field:'front', name:'brand.ai', type:'', size:2000 })), true);
expect('EPS accepted', ok(validateArtworkFile({ field:'front', name:'v.eps', type:'application/postscript', size:2000 })), true);
expect('HEIC accepted', ok(validateArtworkFile({ field:'front', name:'p.heic', type:'', size:2000 })), true);
expect('jpeg accepted', ok(validateArtworkFile({ field:'front', name:'p.JPG', type:'image/jpeg', size:2000 })), true);
expect('webp accepted', ok(validateArtworkFile({ field:'front', name:'p.webp', type:'image/webp', size:2000 })), true);

// ---- oversized rejected ----
expect('oversized rejected', reason(validateArtworkFile({ field:'front', name:'big.pdf', type:'application/pdf', size:ARTWORK_MAX_BYTES+1 })), 'too_large');
expect('at limit accepted', ok(validateArtworkFile({ field:'front', name:'ok.pdf', type:'application/pdf', size:ARTWORK_MAX_BYTES })), true);
expect('zero size rejected', reason(validateArtworkFile({ field:'front', name:'z.pdf', type:'application/pdf', size:0 })), 'bad_size');

// ---- invalid type / extension rejected ----
expect('exe rejected', reason(validateArtworkFile({ field:'front', name:'virus.exe', type:'application/octet-stream', size:10 })), 'blocked_type');
expect('zip rejected', reason(validateArtworkFile({ field:'supporting-1', name:'a.zip', type:'application/zip', size:10 })), 'blocked_type');
expect('js rejected', reason(validateArtworkFile({ field:'front', name:'x.js', type:'text/javascript', size:10 })), 'blocked_type');
expect('no extension rejected', reason(validateArtworkFile({ field:'front', name:'noext', type:'application/pdf', size:10 })), 'no_extension');
expect('unsupported .txt rejected', reason(validateArtworkFile({ field:'front', name:'a.txt', type:'text/plain', size:10 })), 'unsupported_type');
expect('png name wrapping html mime rejected', reason(validateArtworkFile({ field:'front', name:'a.png', type:'text/html', size:10 })), 'mime_mismatch');

// ---- malformed field rejected ----
expect('bad field rejected', reason(validateArtworkFile({ field:'../etc', name:'a.pdf', type:'application/pdf', size:10 })), 'bad_field');
expect('supporting out of range rejected', reason(validateArtworkFile({ field:'supporting-99', name:'a.pdf', type:'application/pdf', size:10 })), 'bad_field');
expect('arbitrary field rejected', reason(validateArtworkFile({ field:'front/../back', name:'a.pdf', type:'application/pdf', size:10 })), 'bad_field');
expect('empty name rejected', reason(validateArtworkFile({ field:'front', name:'', type:'application/pdf', size:10 })), 'malformed');
expect('isValidField front', isValidField('front'), true);
expect('isValidField supporting-9', isValidField('supporting-9'), true);
expect('isValidField supporting-10 false (>=max)', isValidField('supporting-10'), false);
expect('isValidField random false', isValidField('logo'), false);

// ---- excessive count rejected ----
const many = Array.from({ length: ARTWORK_MAX_FILES + 1 }, (_, i) => ({ field:`supporting-${i%10}`, name:`f${i}.pdf`, type:'application/pdf', size:10 }));
expect('too many files rejected', reason(validateArtworkFields(many)), 'too_many');
const good = [{ field:'front', name:'a.pdf', type:'application/pdf', size:10 }, { field:'back', name:'b.png', type:'image/png', size:10 }, { field:'supporting-0', name:'c.svg', type:'image/svg+xml', size:10 }];
expect('valid set accepted', ok(validateArtworkFields(good)), true);
expect('duplicate field rejected', reason(validateArtworkFields([{ field:'front', name:'a.pdf', type:'application/pdf', size:10 }, { field:'front', name:'b.pdf', type:'application/pdf', size:10 }])), 'duplicate_field');

// ---- cross-config path rejected / valid path accepted ----
expect('valid front path accepted', isPathUnderConfig('configurator/cfg-123/front/1700-logo.pdf', 'cfg-123'), true);
expect('valid supporting path accepted', isPathUnderConfig('configurator/cfg-123/supporting-2/1700-x.png', 'cfg-123'), true);
expect('cross-config path rejected', isPathUnderConfig('configurator/OTHER/front/1700-logo.pdf', 'cfg-123'), false);
expect('arbitrary path rejected', isPathUnderConfig('secrets/keys.txt', 'cfg-123'), false);
expect('traversal path rejected', isPathUnderConfig('configurator/cfg-123/../../../etc/passwd', 'cfg-123'), false);
expect('bad field in path rejected', isPathUnderConfig('configurator/cfg-123/evil/x.pdf', 'cfg-123'), false);
expect('null path rejected', isPathUnderConfig(null, 'cfg-123'), false);

// eslint-disable-next-line no-console
console.log(failures === 0 ? '\nALL ARTWORK-VALIDATION TESTS PASSED' : `\n${failures} ARTWORK TEST(S) FAILED`);
if (failures > 0) process.exit(1);
