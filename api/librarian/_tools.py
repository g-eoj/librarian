# Copyright 2026 g-eoj
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.


import asyncio
import hashlib
import os
import pathlib
import re
from urllib.parse import urlsplit

import chromadb
import markdownify
import requests_cache

from langchain_text_splitters import RecursiveCharacterTextSplitter
from playwright.async_api import async_playwright
from requests.adapters import HTTPAdapter
from transformers import AutoTokenizer
from urllib3.util import Retry

from librarian._types import (
    PaperSearchResult,
    SearchResult,
)


model_name = os.environ["VLLM_MODEL_NAME"]
tokenizer = AutoTokenizer.from_pretrained(model_name)

retries = Retry(
    total=3,
    backoff_factor=0.1,
    allowed_methods={"POST"},
)
session = requests_cache.CachedSession(
    "google_search_cache", allowable_methods=["POST"]
)
session.mount("http://", HTTPAdapter(max_retries=retries))
session.mount("https://", HTTPAdapter(max_retries=retries))


def build_url_restricted_query(query: str, allowed_urls: list[str] | None) -> str:
    """Build a search query with URL restrictions."""
    if not allowed_urls:
        return query
    allowed_sites = []
    for url in allowed_urls:
        url = urlsplit(url)
        site = url.netloc + url.path
        if site.startswith("www."):
            site = site[4:]
        allowed_sites.append(site)
    unique_sites: set[str] = set(allowed_sites)
    sites_filter = " OR ".join(f"site:{s}" for s in unique_sites)
    return f"{sites_filter} {query}"


async def get_md(path: str) -> str:
    """Convert a web page or PDF to markdown that is easily consumable by an LLM."""
    md = ""
    async with async_playwright() as playwright:
        browser = await playwright.firefox.launch(
            firefox_user_prefs={
                "pdfjs.disabled": False,
                "browser.download.open_pdf_attachments_inline": True,
                "browser.link.open_newwindow": 1,
            }
        )
        page = await browser.new_page()
        await page.goto(path, wait_until="commit")
        await asyncio.sleep(3)
        for frame in page.frames:
            try:
                # force pdf.js to render all pages (see issue #2 for a more robust fix)
                await frame.page.wait_for_function(
                    "typeof PDFViewerApplication !== 'undefined' && PDFViewerApplication.initialized",
                    timeout=2000,
                )
                total_pages = await frame.page.evaluate(
                    "PDFViewerApplication.pagesCount"
                )
                for _ in range(min(total_pages, 50) - 1):
                    await frame.page.keyboard.press("n")
                    await page.wait_for_timeout(50)
                # try loading the pdf viewer
                content = await frame.inner_html("id=viewer", timeout=500)
            except Exception:
                content = await frame.page.inner_html("body")
            md += (
                markdownify.markdownify(
                    content,
                    strip=["a"],
                    heading_style="ATX",
                    table_infer_header=True,
                )
                + "\n\n"
            )
        await browser.close()
    md = re.sub(r"\n{3,}", "\n\n", md)
    return md


async def read_url(query: str, url: str) -> chromadb.QueryResult:
    """Read a link or paper to answer a query."""
    max_chunks = 100
    max_notes = 9

    chroma_client = chromadb.PersistentClient(
        path=str(pathlib.Path(__file__).parent.parent / "url_store")
    )

    url_hash = hashlib.sha256(url.encode()).hexdigest()
    url_collection = chroma_client.get_or_create_collection(
        name=url_hash,
        configuration={
            "hnsw": {
                "space": "cosine",
                "ef_construction": 128,
                "ef_search": 128,
                "max_neighbors": 64,
            }
        },
    )

    # have we visited the url before?
    if not url_collection.count():
        # split text based on token count
        chunk_size = 3000
        split = RecursiveCharacterTextSplitter.from_huggingface_tokenizer(
            separators=["\n#+"],
            is_separator_regex=True,
            tokenizer=tokenizer,
            chunk_overlap=int(chunk_size * 2 / 3),
            chunk_size=chunk_size,
        ).split_text
        md = await get_md(url)
        chunk_ids: list[str] = []
        chunks: list[str] = []
        for i, chunk in enumerate(split(md)[:max_chunks]):
            chunk_ids.append(f"chunk_{i:02}")
            chunks.append(chunk)
        if chunks:
            url_collection.add(
                ids=chunk_ids,
                documents=chunks,
            )

    query_documents = url_collection.query(
        query_texts=[query],
        n_results=max_notes,
    )

    return query_documents


async def search_papers(
    query: str, allowed_urls: list[str] | None = None
) -> list[PaperSearchResult]:
    """Search for academic papers."""
    output: list[PaperSearchResult] = []
    url = "https://google.serper.dev/scholar"
    search_query = build_url_restricted_query(query, allowed_urls)
    result = session.post(
        url=url,
        data={"q": search_query, "num": 10},
        headers={"X-API-KEY": os.environ["SERPER_API_TOKEN"]},
    )
    result.raise_for_status()
    result = result.json()["organic"]
    for r in result:
        pdf_url = r.get("pdfUrl", None)
        html_url = r.get("htmlUrl", None)
        link_url = r.get("link", None)
        link = pdf_url or html_url or link_url
        output.append(
            PaperSearchResult(
                title=r["title"],
                url=link,
                snippet=r.get("snippet", None),
                publication_info=r.get("publicationInfo", None),
            )
        )
    return output


async def search_web(
    query: str, allowed_urls: list[str] | None = None
) -> list[SearchResult]:
    """Search the web for links."""
    output: list[SearchResult] = []
    url = "https://google.serper.dev/search"
    search_query = build_url_restricted_query(query, allowed_urls)
    result = session.post(
        url=url,
        data={"q": search_query, "num": 10},
        headers={"X-API-KEY": os.environ["SERPER_API_TOKEN"]},
    )
    result.raise_for_status()
    result = result.json()["organic"]
    for r in result:
        link = r["link"]
        output.append(
            SearchResult(
                title=r["title"],
                url=link,
                snippet=r.get("snippet", None),
            )
        )
    return output
