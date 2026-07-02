export const getDateEndSubToDb = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
};
