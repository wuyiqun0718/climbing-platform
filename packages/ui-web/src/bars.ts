/**
 * BarList 的一行。width / inner 是 0–100 的百分比；inner 画在条里面，表示「其中」的部分（比如新客里办卡的）。
 */
export interface BarRow {
  key: string;
  label: string;
  value: string | number;
  note?: string;
  width: number;
  inner?: number;
}
