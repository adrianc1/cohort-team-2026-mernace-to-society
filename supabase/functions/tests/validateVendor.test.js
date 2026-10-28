import { assertEquals } from 'jsr:@std/assert';
import { validateVendor } from '../_shared/validateVendor.js';

const valid = {
	aliases: ['ConEd', 'Consolidated Edison'],
	portal_url: 'https://www.coned.com/',
};

Deno.test('accepts a valid vendor', () => {
	assertEquals(validateVendor(valid), { ok: true, value: valid });
});

Deno.test('portal_url is optional', () => {
	const result = validateVendor({ aliases: ['ConEd'] });
	assertEquals(result, { ok: true, value: { aliases: ['ConEd'], portal_url: null } });
});

Deno.test('empty portal_url becomes null', () => {
	const result = validateVendor({ ...valid, portal_url: '' });
	assertEquals(result.value.portal_url, null);
});

Deno.test('trims aliases', () => {
	const result = validateVendor({ ...valid, aliases: ['  ConEd  '] });
	assertEquals(result.value.aliases, ['ConEd']);
});

Deno.test('removes duplicate aliases ignoring case', () => {
	const result = validateVendor({ ...valid, aliases: ['ConEd', 'coned', 'CONED'] });
	assertEquals(result.value.aliases, ['ConEd']);
});

Deno.test("drops fields the user shouldn't control", () => {
	const result = validateVendor({ ...valid, status: 'inactive', id: 'abc' });
	assertEquals(result, { ok: true, value: valid });
});

const invalidCases = [
	['null body', null],
	['array body', [valid]],
	['missing aliases', { portal_url: valid.portal_url }],
	['aliases not an array', { ...valid, aliases: 'ConEd' }],
	['empty aliases', { ...valid, aliases: [] }],
	['blank alias', { ...valid, aliases: ['ConEd', '   '] }],
	['alias not a string', { ...valid, aliases: [42] }],
	['alias too long', { ...valid, aliases: ['x'.repeat(101)] }],
	['too many aliases', { ...valid, aliases: Array.from({ length: 21 }, (_, i) => `a${i}`) }],
	['portal_url not a string', { ...valid, portal_url: 123 }],
	['portal_url not a url', { ...valid, portal_url: 'coned dot com' }],
	['portal_url javascript scheme', { ...valid, portal_url: 'javascript:alert(1)' }],
	['portal_url ftp scheme', { ...valid, portal_url: 'ftp://coned.com' }],
];

for (const [label, input] of invalidCases) {
	Deno.test(`rejects: ${label}`, () => {
		assertEquals(validateVendor(input).ok, false);
	});
}
