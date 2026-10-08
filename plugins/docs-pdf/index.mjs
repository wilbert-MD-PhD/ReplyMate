import {fileURLToPath} from 'node:url';
import {getDocument} from './node_modules/pdfjs-dist/legacy/build/pdf.mjs';
export const protocol=1;
const asset=name=>fileURLToPath(new URL('./node_modules/pdfjs-dist/'+name+'/',import.meta.url)).replaceAll('\\','/');
export async function extract(data){const task=getDocument({data:new Uint8Array(data),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,cMapUrl:asset('cmaps'),cMapPacked:true,standardFontDataUrl:asset('standard_fonts'),wasmUrl:asset('wasm')});
 try{const pdf=await task.promise;let text='';for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i),content=await page.getTextContent();for(const item of content.items)if('str' in item)text+=item.str+(item.hasEOL?'\n':' ');text+='\n';page.cleanup();}return text;}finally{await task.destroy();}}
export async function selfTest(){if(typeof getDocument!=='function')throw Error('PDF 组件未能加载');}
