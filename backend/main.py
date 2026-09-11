from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


PROJECT_ROOT = Path(_file_).resolve().parent.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"


app = FastAPI(
    title="Human Error",
    version="0.1.0",
)


# 把 frontend 文件夹作为静态文件目录
app.mount(
    "/static",
    StaticFiles(directory=FRONTEND_DIR),
    name="static",
)


# 浏览器访问首页时返回 index.html
@app.get("/")
def show_index() -> FileResponse:
    return FileResponse(
        FRONTEND_DIR / "index.html"
    )