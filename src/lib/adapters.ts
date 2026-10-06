import type { Source } from './model';
export interface SourceAdapter { id:string; label:string; mode:'manual'|'external'; collect(input:File[],source:Source):Promise<FormData[]> }
// External adapters implement the same contract when actual APIs and access are defined.
export class ManualUploadAdapter implements SourceAdapter {
  id='manual';label='Upload manual';mode='manual' as const;
  async collect(files:File[],source:Source) { return files.map(file=>{const form=new FormData();form.set('file',file);form.set('source',source);return form;}); }
}
