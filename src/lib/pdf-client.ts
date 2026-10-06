export async function extractPDF(file:File,progress:(message:string)=>void) {
  const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())});
  const pdf=await task.promise;
  if(pdf.numPages>40)throw new Error('Divida PDFs com mais de 40 páginas.');
  const pages:{text:string;ocr:boolean}[]=[];
  let worker:Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>|undefined;
  try {
    for(let n=1;n<=pdf.numPages;n++) {
      progress(`${file.name} · lendo página ${n}/${pdf.numPages}`);
      const page=await pdf.getPage(n),content=await page.getTextContent();
      let previousY:number|undefined;let text='';
      for(const item of content.items)if('str'in item){const y=item.transform[5];if(previousY!==undefined&&Math.abs(y-previousY)>3)text+='\n';text+=item.str+' ';previousY=y;}
      let ocr=false;
      if(text.replace(/\s/g,'').length<35) {
        progress(`${file.name} · reconhecimento OCR da página ${n}/${pdf.numPages}`);
        const {createWorker}=await import('tesseract.js');
        worker??=await createWorker('eng',1,{workerPath:'/ocr/worker.min.js',corePath:'/ocr/core',langPath:'/ocr/lang',logger:()=>{}});
        const viewport=page.getViewport({scale:1.7}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;
        await page.render({canvas,viewport}).promise;const result=await worker.recognize(canvas);text=result.data.text;ocr=true;canvas.width=0;canvas.height=0;
      }
      pages.push({text,ocr});page.cleanup();
    }
  }finally{await worker?.terminate();await task.destroy();}
  return pages;
}
