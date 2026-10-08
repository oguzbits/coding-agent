// Decides whether the end of a turn must be backed by a green `npm run check`.
const CODE = /^(apps\/|package(-lock)?\.json$|\.claude\/hooks\/|knip\.json$|\.dependency-cruiser\.cjs$)/;

export const needsCheck = (changedFiles) => changedFiles.some((file) => CODE.test(file));
