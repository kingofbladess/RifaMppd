import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { listRegistrationId, createdFromRaffleList } from '../lib/list-registration-id.ts';
import { registrationEvidence, listRegistrationChecks, listRegistrationLabel } from '../lib/registration-evidence.ts';

test('reconoce registros anteriores con la misma huella usada originalmente', () => {
 const raffle='00000000-0000-0000-0000-000000000001', doc='12345678';
 const hex=createHash('sha256').update(`list:${raffle}:${doc}`).digest('hex');
 const old=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
 assert.equal(listRegistrationId(raffle,doc),old);
 assert.equal(createdFromRaffleList(raffle,doc,old+'.jpg'),true);
 assert.equal(createdFromRaffleList('otra-rifa',doc,old+'.jpg'),false);
 assert.equal(createdFromRaffleList(raffle,doc,'foto-operador.jpg'),false);
});
test('dos palometas incluyen registros previos por otra vía y confirmaciones posteriores', () => {
 assert.equal(listRegistrationChecks('list_only',true),1);
 assert.equal(listRegistrationChecks('other',true),2);
 assert.equal(listRegistrationChecks('list_operator',true),2);
 assert.equal(listRegistrationChecks('other',false),0);
 assert.equal(listRegistrationChecks('list_only',false),0);
 assert.equal(listRegistrationChecks('list_unverified',true),null);
 assert.equal(listRegistrationChecks(undefined,true),null);
 assert.equal(listRegistrationChecks(undefined,true,false),1);
 assert.ok(listRegistrationLabel('other',true).startsWith('✅✅'));
 assert.ok(listRegistrationLabel('list_only',true).startsWith('✅ '));
 assert.equal(listRegistrationLabel('list_unverified',true),'Por verificar');
});
test('una importación no demuestra que la persona haya sido atendida por un operador',()=>{
 assert.equal(registrationEvidence(true,true,false),'list_only');
 assert.equal(registrationEvidence(true,true,true),'list_operator');
 assert.equal(registrationEvidence(false,true,false),'other');
 assert.equal(registrationEvidence(true,false,false),'list_unverified');
 assert.equal(registrationEvidence(true,false,true),'list_unverified');
});
