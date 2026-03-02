from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, date


# ── Auth ──
class LoginRequest(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    user: dict

class UserOut(BaseModel):
    id: int
    email: str
    name: str
    role: str


# ── Sellers ──
class SellerCreate(BaseModel):
    name: str
    phone: str
    team: str = "closer"
    instance_name: Optional[str] = None
    zapi_instance_id: Optional[str] = None
    zapi_instance_token: Optional[str] = None
    is_active: bool = True
    active: Optional[bool] = None  # frontend compat

class SellerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    team: Optional[str] = None
    instance_name: Optional[str] = None
    zapi_instance_id: Optional[str] = None
    zapi_instance_token: Optional[str] = None
    is_active: Optional[bool] = None
    active: Optional[bool] = None  # frontend compat

class SellerOut(BaseModel):
    id: int
    name: str
    phone: str
    team: str
    instance_name: Optional[str] = None
    zapi_instance_id: Optional[str] = None
    zapi_instance_token: Optional[str] = None
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    total_conversations: int = 0
    avg_score: Optional[float] = None
    avg_response_time_seconds: Optional[float] = None
    recent_metrics: list = []

    class Config:
        from_attributes = True


# ── Conversations ──
class ConversationOut(BaseModel):
    id: int
    seller_id: int
    customer_name: Optional[str] = None
    customer_phone: str
    message_count: int = 0
    started_at: Optional[datetime] = None
    last_message_at: Optional[datetime] = None
    status: str = "active"
    is_group: bool = False
    seller: Optional[dict] = None
    analysis: Optional[dict] = None

    class Config:
        from_attributes = True

class MessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_type: str
    sender_name: Optional[str] = None
    content: Optional[str] = None
    message_type: str = "text"
    timestamp: datetime
    from_me: bool = False

    class Config:
        from_attributes = True


# ── Analysis ──
class AnalysisOut(BaseModel):
    id: int
    conversation_id: int
    sentiment_label: Optional[str] = None
    sentiment_score: Optional[float] = None
    quality_score: Optional[float] = None
    quality_breakdown: Optional[dict] = None
    stage: Optional[str] = None
    tone: Optional[str] = None
    summary: Optional[str] = None
    keywords: Optional[list] = None
    objections: Optional[list] = None
    objections_handled: Optional[list] = None
    analyzed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Alerts ──
class AlertOut(BaseModel):
    id: int
    seller_id: Optional[int] = None
    conversation_id: Optional[int] = None
    alert_type: str
    severity: str
    message: str
    resolved: bool = False
    resolved_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Exclusion List ──
class ExclusionAddRequest(BaseModel):
    numbers_text: str
    reason: Optional[str] = None

class ExclusionBulkDeleteRequest(BaseModel):
    ids: list[int]

class ExclusionClearRequest(BaseModel):
    token: str

class ExcludedNumberOut(BaseModel):
    id: int
    phone_normalized: str
    original_format: Optional[str] = None
    reason: Optional[str] = None
    added_at: Optional[datetime] = None
    active: bool = True

    class Config:
        from_attributes = True


# ── Alert Config ──
class AlertConfigOut(BaseModel):
    maxResponseTime: int = 300
    daysWithoutFollowUp: int = 3
    unhandledObjectionHours: int = 24

class AlertConfigUpdate(BaseModel):
    maxResponseTime: Optional[int] = None
    daysWithoutFollowUp: Optional[int] = None
    unhandledObjectionHours: Optional[int] = None


# ── Agent ──
class AgentChatRequest(BaseModel):
    question: str

class AgentChatResponse(BaseModel):
    answer: str
    response: str


# ── Tasks ──
class TaskStatusOut(BaseModel):
    id: str
    status: str
    progress: float = 0
    message: str = ""
    current: int = 0
    total: int = 0
    result: Optional[dict] = None


# ── Sync / Analyze ──
class SyncRequest(BaseModel):
    days: int = 7

class AnalyzeRequest(BaseModel):
    force: bool = False
