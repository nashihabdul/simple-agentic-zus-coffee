import os
import sys
from loguru import logger

from langchain_openai import ChatOpenAI
from langchain_chroma import Chroma
from chromadb.config import Settings as ChromaClientSettings

from sentence_transformers import SentenceTransformer

path_this = os.path.dirname(os.path.abspath(__file__))
path_project = os.path.dirname(os.path.join(path_this, '..'))
path_root = os.path.dirname(os.path.join(path_this, '../..'))
sys.path.extend([path_root, path_project, path_this])

from config import settings

class ChromaRetriever:
    def __init__(self, 
                 top_k:int = 10,
                 collection: str = "zus-drinkware"
        ):
        self.top_k = top_k
        self.collection = collection

        # LLM
        self.llm = ChatOpenAI(
            model="gpt-5-mini",
            api_key=settings.LLM_KEY,
            temperature=0.0
        )

        # Embedding model
        self.embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

        logger.info("ChromaRetriever initialized successfully.")

    def embedding_function(self, texts):
        """Convert string or list[str] into embeddings."""
        if isinstance(texts, str):
            texts = [texts]
        return self.embedding_model.encode(texts).tolist()

    def get_context(self, query: str) -> str:
        """
        Retrieve context from Chroma and generate LLM response.
        """
        base_dir = os.getcwd()
        persist_directory = os.path.join(base_dir, "local_db", "chroma")

        logger.info(f"Loading collection '{self.collection}' from {persist_directory}")

        client_settings = ChromaClientSettings(
            persist_directory=persist_directory,
            allow_reset=False,
        )

        # Initialize DB client
        db = Chroma(
            collection_name=self.collection,
            embedding_function=self.embedding_function,
            client_settings=client_settings,
            persist_directory=persist_directory
        )

        # Embed query
        query_embedding = self.embedding_function(query)[0]

        # Retrieve
        results = db.similarity_search_by_vector(query_embedding, k=self.top_k)

        if not results:
            return "No documents found for the given query."

        # Build context in the requested XML-ish format
        context_lines = ["Context:"]
        for doc in results:
            title = doc.metadata.get("title", "Untitled")
            page = doc.page_content
            context_lines.append(f"<title>{title}</title>")
            context_lines.append(f"<page_content>{page}</page_content>")

        context_text = "\n".join(context_lines)

        # Create final prompt
        messages = [
            (
                "system",
                f"""
                You are an expert assistant for customer service. Based on the retrieved context below, answer the user's question clearly and concisely.
                
                <Context>
                {context_text}
                </end history>
                """
            ),
            (
                "human",
                f"USER QUESTION:\n{query}\n\nAlways answer in English."
            )
        ]

        # Generate answer
        response = self.llm.invoke(messages)

        return response.content