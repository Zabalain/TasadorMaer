/** La interfaz es public/index.html; la raíz del sitio la sirve tal cual. */
module.exports = {
  async rewrites() {
    return [{ source: '/', destination: '/index.html' }];
  },
};
