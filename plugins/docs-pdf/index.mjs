import {fileURLToPath} from 'node:url';
import {getDocument} from './node_modules/pdfjs-dist/legacy/build/pdf.mjs';
export const protocol=1;
const asset=name=>fileURLToPath(new URL('./node_modules/pdfjs-dist/'+name+'/',import.meta.url)).replaceAll('\\','/');
export async function extract(data){const task=getDocument({data:new Uint8Array(data),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,cMapUrl:asset('cmaps'),cMapPacked:true,standardFontDataUrl:asset('standard_fonts'),wasmUrl:asset('wasm')});const timer=setTimeout(()=>task.destroy(),30000);
 try{const pdf=await task.promise;if(pdf.numPages>2000)throw Error('PDF 页数过多');let text='';for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i),content=await page.getTextContent();for(const item of content.items)if('str' in item)text+=item.str+(item.hasEOL?'\n':' ');text+='\n';page.cleanup();if(text.length>2_000_000)throw Error('PDF 文字量过大');}return text;}finally{clearTimeout(timer);await task.destroy();}}
export async function selfTest(){if(typeof getDocument!=='function')throw Error('PDF 组件未能加载');}
