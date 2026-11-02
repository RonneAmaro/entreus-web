export function mp4DownloadName(projectName: string) {
  const cleaned = projectName.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 80).trim() || 'entreus-video'
  const safeName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned) ? `EntreUS-${cleaned}` : cleaned
  return `${safeName}.mp4`
}
