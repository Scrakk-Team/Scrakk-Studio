export async function onRequest(context) {
  const url = new URL(context.request.url);
  const m = url.pathname.match(/\/Scrakk-Studio-(.+)\.deb$/i);
  if (m) {
    const version = m[1];
    const gh = `https://github.com/Scrakk-Team/Scrakk-Studio/releases/download/v${version}/Scrakk-Studio-${version}.deb`;
    return Response.redirect(gh, 302);
  }
  return context.next();
}
