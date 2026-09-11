# 型ヒントをより柔軟に扱うための設定
from __future__ import annotations

# データを簡単に管理するためのモジュール
from dataclasses import dataclass, field
from enum import StrEnum

# ゲームの進行状態を表すクラス
class Phase(StrEnum):
                  LOBBY = "lobby"    # ゲーム開始前
                  DRAWING = "drawing"    # お絵描き中
                  RESULT = "result"    # 結果表示


@dataclass
class AdaptiveAI:
                  """学習機能を持つ簡易的なAIクラス"""

                  # 各単語を何回学習したかを保存する
                  word_exposure: dict[str, int] = field(default_factory=dict)
                  # 単語ごとに学習したヒントを保存する
                  learned_clues: dict[str, set[str]] = field(default_factory=dict)

                  # 単語とヒントからAIの予測結果を作成する
                  def predict(self, word: str, clues: list[str]) -> dict:
                                    # この単語を今まで何回学習したか取得する
                                    exposure = self.word_exposure.get(word, 0)

                                    # この単語について、すでに学習しているヒントを取得する
                                    known = self.learned_clues.get(word, set())

                                    # 今回のヒントと学習済みヒントが何個一致しているか数える
                                    clue_matches = len(known.intersection(clues))

                                    # 学習回数とヒントの一致数から信頼度を計算する
                                    confidence = min(0.95, 0.12 + exposure * 0.16 + clue_matches * 0.22)

                                    # 信頼度が50%以上なら答えを予測する
                                    guessed_word = word if confidence >= 0.5 else "わからない"

                                    # AIの予測結果を返す
                                    return {
                                    "guess": guessed_word,
                                    "confidence": round(confidence, 2),
                                    "matched_clues": sorted(known.intersection(clues)),
                                    }

                  # 正解した単語とヒントをAIに学習させる
                  def learn(self, word: str, clues: list[str]) -> None:
                                    self.word_exposure[word] = self.word_exposure.get(word, 0) + 1
                                    self.learned_clues.setdefault(word, set()).update(clues)


@dataclass
class GameRoom:
                  room_code: str = "DEMO"    # ルームコード
                  phase: Phase = Phase.LOBBY    # 現在のゲーム状態
                  round_number: int = 0    # 現在のラウンド番号
                  secret_word: str | None = None    # 今回のお題
                  last_result: dict | None = None    # 前回のゲーム結果
                  ai: AdaptiveAI = field(default_factory=AdaptiveAI)    # AIを作成する

                  # 新しいラウンドを開始する
                  def start_round(self, word: str) -> dict:
                                    # お題が空の場合はエラーにする
                                    if not word.strip():
                                                      raise ValueError("word must not be empty")
                                    self.round_number += 1    # ラウンド番号を1増やす
                                    self.secret_word = word.strip()    # 今回のお題を設定する
                                    self.phase = Phase.DRAWING    # ゲーム状態を「お絵描き中」に変更する
                                    self.last_result = None    # 前回の結果をリセットする
                                    return self.public_state()    # 現在のゲーム状態を返す

                  # ラウンドを終了して結果を判定する
                  def finish_round(self, human_guesses: list[str], clues: list[str]) -> dict:
                                    # ラウンドが開始されていない場合はエラーにする
                                    if self.phase != Phase.DRAWING or self.secret_word is None:
                                                      raise ValueError("no active round")

                                    # プレイヤーの回答を比較しやすい形に変換する
                                    normalized = [guess.strip().lower() for guess in human_guesses]
                                    # 正解の単語を小文字に変換する
                                    answer = self.secret_word.lower()
                                    # 人間が正解したか判定する
                                    human_correct = answer in normalized
                                    # AIにも答えを予測させる
                                    ai_result = self.ai.predict(self.secret_word, clues)
                                    # AIが正解したか判定する
                                    ai_correct = ai_result["guess"].lower() == answer

                                    # 勝者を決定する
                                    if human_correct and not ai_correct:
                                                      winner = "humans"
                                    elif ai_correct:
                                                      winner = "ai"
                                    else:
                                                      winner = "nobody"

                                    # 今回のお題とヒントをAIに学習させる
                                    self.ai.learn(self.secret_word, clues)
                                    # ゲーム状態を「結果表示」に変更する
                                    self.phase = Phase.RESULT
                                    # 今回の結果を保存する
                                    self.last_result = {
                                                      "word": self.secret_word,
                                                      "human_correct": human_correct,
                                                      "ai": ai_result,
                                                      "winner": winner,
                                                      "learned_clues": sorted(self.ai.learned_clues[self.secret_word]),
                                    }

                                    # ゲーム結果を返す
                                    return self.last_result

                  # プレイヤーに公開するゲーム状態を取得する
                  def public_state(self) -> dict:
                                    return {
                                                      "room_code": self.room_code,
                                                      "phase": self.phase,
                                                      "round_number": self.round_number,
                                                      "last_result": self.last_result,
                                    }