from pydantic import BaseModel, Field


class StartRoundRequest(BaseModel):
    word: str = Field(
        min_length=1,
        max_length=40,
    )


class FinishRoundRequest(BaseModel):
    human_guesses: list[str] = Field(
        default_factory=list
    )

    clues: list[str] = Field(
        default_factory=list
    )