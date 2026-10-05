name: Rebold — Actualizar Dashboards Email

on:
  schedule:
    - cron: '0 13 * * 1'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  update-dashboards:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    steps:
      - name: Checkout repositorio
        uses: actions/checkout@v4

      - name: Configurar Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Instalar dependencias
        run: pip install requests

      - name: Generar dashboards
        env:
          GRANITE_API_KEY: ${{ secrets.GRANITE_API_KEY }}
          GRANITE_METRIC_ID: ${{ secrets.GRANITE_METRIC_ID }}
          AYOBA_API_KEY: ${{ secrets.AYOBA_API_KEY }}
          AYOBA_METRIC_ID: ${{ secrets.AYOBA_METRIC_ID }}
          BROOKLYN_API_KEY: ${{ secrets.BROOKLYN_API_KEY }}
          BROOKLYN_METRIC_ID: ${{ secrets.BROOKLYN_METRIC_ID }}
          BEG_API_KEY: ${{ secrets.BEG_API_KEY }}
          BEG_METRIC_ID: ${{ secrets.BEG_METRIC_ID }}
          OUTPUT_DIR: output
        run: |
          cd dashboards
          python generate_dashboards.py

      - name: Configurar Pages
        uses: actions/configure-pages@v4

      - name: Subir archivos a Pages
        uses: actions/upload-pages-artifact@v3
        with:
          path: dashboards/output

      - name: Desplegar en GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
