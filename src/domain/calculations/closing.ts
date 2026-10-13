/** Id determinista: un solo cierre por negocio y mes (guardarlo dos veces no duplica). */
export const closingId = (businessId: string, month: string) => `${businessId}_${month}`
