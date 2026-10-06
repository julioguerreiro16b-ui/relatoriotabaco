import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'H&F | Controle de estoque',description:'Entradas, saídas e conciliação de Dry Snuff e Mapacho Rolls.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>;}
