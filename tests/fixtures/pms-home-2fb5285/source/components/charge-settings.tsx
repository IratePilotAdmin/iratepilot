'use client';
import {useState} from 'react';
import {taxKeys,feeKeys,taxLabels,feeLabels,type ChargeConfig,type TaxKey} from '@/lib/rates';
export function ChargeSettings({initial,busy}:{initial:ChargeConfig;busy:boolean}){
 const [enabledTaxes,setEnabledTaxes]=useState(()=>Object.fromEntries(taxKeys.map(k=>[k,initial.taxes[k].enabled])) as Record<TaxKey,boolean>);
 const [enabledFees,setEnabledFees]=useState(()=>({resort:initial.fees.resort.enabled,technology:initial.fees.technology.enabled}));
 const visibleTaxes=taxKeys.filter(k=>k!=='legacy'||initial.taxes.legacy.enabled||initial.taxes.legacy.basis_points>0||feeKeys.some(f=>initial.fees[f].taxes.includes('legacy')));
 return <div className="pilot-charge-settings">
  <h3>Taxes</h3><p>Enter the rates that apply to this plan. Each enabled tax applies to the room price. Select taxable fees below.</p>
  {visibleTaxes.map(key=><fieldset className="pilot-charge-rule" key={key} disabled={busy}><legend>{taxLabels[key]}</legend><label className="pilot-check"><input name={key+'_enabled'} type="checkbox" checked={enabledTaxes[key]} onChange={e=>setEnabledTaxes(v=>({...v,[key]:e.target.checked}))}/>Enable {taxLabels[key]}</label><label className="field">{taxLabels[key]} (%)<input name={key+'_rate'} type="number" min="0" max="100" step="0.01" required defaultValue={(initial.taxes[key].basis_points/100).toFixed(2)}/></label>{key==='legacy'&&<p>Your previous combined tax is preserved here. Disable it if the separate taxes replace it.</p>}</fieldset>)}
  <h3>Optional hotel fees</h3><p>Fixed amounts in USD. A per-stay fee is charged once on the first night. Saved settings apply only when the fee is enabled.</p>
  {feeKeys.map(key=><fieldset className="pilot-charge-rule" key={key} disabled={busy}><legend>{feeLabels[key]}</legend><label className="pilot-check"><input name={key+'_enabled'} type="checkbox" checked={enabledFees[key]} onChange={e=>setEnabledFees(v=>({...v,[key]:e.target.checked}))}/>Enable {feeLabels[key]}</label><div className="form-grid"><label className="field">{feeLabels[key]} amount (USD)<input name={key+'_amount'} type="number" min="0" step="0.01" required defaultValue={(initial.fees[key].amount_minor/100).toFixed(2)}/></label><label className="field">{feeLabels[key]} frequency<select name={key+'_basis'} defaultValue={initial.fees[key].basis}><option value="per_night">Per night</option><option value="per_stay">Per stay</option></select></label></div><p>Taxes on this fee</p>{visibleTaxes.map(t=><label className="pilot-check" key={t}><input name={key+'_tax_'+t} type="checkbox" defaultChecked={initial.fees[key].taxes.includes(t)}/>Apply {taxLabels[t]} to {feeLabels[key]}{!enabledTaxes[t]&&<small>Tax is currently off</small>}</label>)}</fieldset>)}
  <p>Taxes are calculated separately without compounding, rounded to the nearest cent for each night. No jurisdiction rates are filled in automatically.</p>
 </div>;
}
