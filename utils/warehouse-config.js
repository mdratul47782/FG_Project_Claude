// utils/warehouse-config.js
export const ROW_HEIGHT_CM = 152.4; // 5 ft = 152.4 cm
export const ROW_WIDTH_CM = 109;

export const WAREHOUSE_ROWS = {
  // A1 (left section)
  "A1-1": { section: "A1", length: 1981, width: ROW_WIDTH_CM, height: ROW_HEIGHT_CM },
  "A1-2": { section: "A1", length: 323, width: ROW_WIDTH_CM, height: ROW_HEIGHT_CM },
  "A1-3": { section: "A1", length: 548, width: ROW_WIDTH_CM, height: ROW_HEIGHT_CM },
  "A1-4": { section: "A1", length: 548, width: ROW_WIDTH_CM, height: ROW_HEIGHT_CM },
  "A1-5": { section: "A1", length: 353, width: ROW_WIDTH_CM, height: ROW_HEIGHT_CM },

  // A2 (right section)
  "A2-1": { section: "A2", length: 1981, width: ROW_WIDTH_CM, height: ROW_HEIGHT_CM },
  "A2-2": { section: "A2", length: 1981, width: ROW_WIDTH_CM, height: ROW_HEIGHT_CM },
};

export const ALL_ROW_IDS = Object.keys(WAREHOUSE_ROWS).sort();

export function rowCBM(row) {
  // (L * W * H) cm3 -> m3
  return (row.length * row.width * row.height) / 1_000_000;
}
