'use client';
import type { State } from '@/lib/model';
import type { Act } from './shared';
import HistoricalWorkbook from './historical-workbook';
export default function HistoryReview({state}:{state:State;act:Act}){return <HistoricalWorkbook state={state}/>;}
