import os
import sys
import traceback
from typing import Optional

import argparse

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from loguru import logger

path_this = os.path.dirname(os.path.abspath(__file__))
path_project = os.path.dirname(os.path.join(path_this, '..'))
path_root = os.path.dirname(os.path.join(path_this, '../..'))
sys.path.extend([path_root, path_project, path_this])

from tools.chroma_retriever import ChromaRetriever

app = FastAPI(
    title="Product Information",
    version="0.0.1"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = FastAPI(title="Product Information", root_path="/api", docs_url="/docs", redoc_url=None)
app.mount("/api", api)

class DocumentQueryRequest(BaseModel):
    query: str = Field(
        ..., 
        description="User query to be searched in the document"
    )

class DocumentQueryResponse(BaseModel):
    query: str
    result: str

@api.post("/products", tags=["Ask Document"], response_model=DocumentQueryResponse)
async def process_document_query(request: DocumentQueryRequest):
    try:
        logger.info(f"Processing query: '{request.query}'")
        
        doc_qa = ChromaRetriever(
            top_k=10,
            collection="zus-drinkware"
        )
        
        search_results =  await doc_qa.get_context(
            query=request.query
        )
        
        return JSONResponse(content=search_results)
    
    except Exception as error:
        logger.exception(f"Error processing document query: {str(error)}")
        traceback.print_exc()
        
        error_response = {
            "error": f"Internal Server Error: {str(error)}",
            "query": request.query
        }
        
        raise HTTPException(
            status_code=500, 
            detail=error_response
        )
