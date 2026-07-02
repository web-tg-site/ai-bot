export const formatNumber = (value: number) =>
    value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
