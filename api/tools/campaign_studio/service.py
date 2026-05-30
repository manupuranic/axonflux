from __future__ import annotations

import uuid as _uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from api.tools.campaign_studio.models import (
    Campaign, CampaignProduct, CampaignDesign,
    CampaignDesignVersion, CampaignChatMessage, CampaignAsset,
)
from api.tools.campaign_studio.schemas import (
    CampaignCreate, CampaignUpdate,
    CampaignProductCreate, CampaignProductUpdate,
    CampaignDesignCreate, CampaignDesignUpdate,
    CampaignAssetCreate,
)


# ---------------------------------------------------------------------------
# Campaigns
# ---------------------------------------------------------------------------

def list_campaigns(
    db: Session,
    limit: int = 30,
    offset: int = 0,
    status: str | None = None,
) -> tuple[int, list[tuple[Campaign, int, int]]]:
    q = db.query(Campaign).order_by(Campaign.created_at.desc())
    if status:
        q = q.filter(Campaign.status == status)
    total = q.count()
    campaigns = q.limit(limit).offset(offset).all()
    results = []
    for c in campaigns:
        product_count = db.query(CampaignProduct).filter(CampaignProduct.campaign_id == c.id).count()
        design_count = db.query(CampaignDesign).filter(CampaignDesign.campaign_id == c.id).count()
        results.append((c, product_count, design_count))
    return total, results


def get_campaign(db: Session, campaign_id: str) -> Campaign | None:
    return db.query(Campaign).filter(Campaign.id == campaign_id).first()


def create_campaign(db: Session, body: CampaignCreate, user_id: str) -> Campaign:
    campaign = Campaign(
        id=_uuid.uuid4(),
        title=body.title,
        campaign_type=body.campaign_type,
        objective=body.objective,
        audience=body.audience,
        theme_id=body.theme_id,
        channels=body.channels or [],
        status="draft",
        created_by=user_id,
        created_at=datetime.now(timezone.utc),
        valid_from=body.valid_from,
        valid_until=body.valid_until,
        metadata_=body.metadata,
    )
    db.add(campaign)
    return campaign


def update_campaign(db: Session, campaign_id: str, body: CampaignUpdate) -> Campaign | None:
    campaign = get_campaign(db, campaign_id)
    if not campaign:
        return None
    data = body.model_dump(exclude_none=True)
    if "metadata" in data:
        campaign.metadata_ = data.pop("metadata")
    for field, value in data.items():
        setattr(campaign, field, value)
    return campaign


def duplicate_campaign(db: Session, campaign_id: str, user_id: str) -> Campaign | None:
    source = get_campaign(db, campaign_id)
    if not source:
        return None
    copy = Campaign(
        id=_uuid.uuid4(),
        title=f"{source.title} (Copy)",
        campaign_type=source.campaign_type,
        objective=source.objective,
        audience=source.audience,
        theme_id=source.theme_id,
        channels=list(source.channels or []),
        status="draft",
        created_by=user_id,
        created_at=datetime.now(timezone.utc),
        valid_from=source.valid_from,
        valid_until=source.valid_until,
        metadata_=source.metadata_,
    )
    db.add(copy)
    db.flush()

    for p in db.query(CampaignProduct).filter(CampaignProduct.campaign_id == source.id).all():
        db.add(CampaignProduct(
            id=_uuid.uuid4(), campaign_id=copy.id,
            barcode=p.barcode, display_name=p.display_name,
            priority=p.priority, role=p.role, sort_order=p.sort_order,
            offer_price=p.offer_price, original_price=p.original_price,
            highlight_text=p.highlight_text, image_url=p.image_url,
            category=p.category, unit=p.unit,
        ))

    for d in db.query(CampaignDesign).filter(CampaignDesign.campaign_id == source.id).all():
        db.add(CampaignDesign(
            id=_uuid.uuid4(), campaign_id=copy.id,
            title=d.title, design_type=d.design_type, target=d.target,
            target_width_px=d.target_width_px, target_height_px=d.target_height_px,
            dsl=d.dsl, theme=d.theme,
            version_retention=d.version_retention, status="draft",
            created_by=user_id, created_at=datetime.now(timezone.utc),
        ))

    return copy


# ---------------------------------------------------------------------------
# Campaign Products
# ---------------------------------------------------------------------------

def list_products(db: Session, campaign_id: str) -> list[CampaignProduct]:
    return (
        db.query(CampaignProduct)
        .filter(CampaignProduct.campaign_id == campaign_id)
        .order_by(CampaignProduct.sort_order)
        .all()
    )


def add_product(db: Session, campaign_id: str, body: CampaignProductCreate) -> CampaignProduct:
    product = CampaignProduct(
        id=_uuid.uuid4(),
        campaign_id=campaign_id,
        barcode=body.barcode,
        display_name=body.display_name,
        priority=body.priority,
        role=body.role,
        sort_order=body.sort_order,
        offer_price=body.offer_price,
        original_price=body.original_price,
        highlight_text=body.highlight_text,
        image_url=body.image_url,
        category=body.category,
        unit=body.unit,
    )
    db.add(product)
    return product


def update_product(db: Session, product_id: str, body: CampaignProductUpdate) -> CampaignProduct | None:
    product = db.query(CampaignProduct).filter(CampaignProduct.id == product_id).first()
    if not product:
        return None
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    return product


def remove_product(db: Session, product_id: str) -> bool:
    product = db.query(CampaignProduct).filter(CampaignProduct.id == product_id).first()
    if product:
        db.delete(product)
        return True
    return False


def bulk_add_products(
    db: Session,
    campaign_id: str,
    barcodes: list[str],
) -> list[CampaignProduct]:
    """Resolve barcodes from app.products + derived and bulk-insert into campaign."""
    from sqlalchemy import text
    from config.db import engine

    if not barcodes:
        return []

    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT
                    COALESCE(p.canonical_name, d.product_name) AS display_name,
                    d.barcode,
                    d.mrp AS original_price,
                    p.category,
                    p.unit_of_measure AS unit,
                    p.image_url
                FROM derived.product_dimension d
                LEFT JOIN app.products p ON p.barcode = d.barcode
                WHERE d.barcode = ANY(:barcodes)
            """),
            {"barcodes": barcodes},
        ).fetchall()

    added = []
    for row in rows:
        p = CampaignProduct(
            id=_uuid.uuid4(),
            campaign_id=campaign_id,
            barcode=row.barcode,
            display_name=row.display_name,
            original_price=row.original_price,
            category=row.category,
            unit=row.unit,
            image_url=row.image_url,
            priority="feature",
            sort_order=len(added),
        )
        db.add(p)
        added.append(p)
    return added


# ---------------------------------------------------------------------------
# Campaign Designs
# ---------------------------------------------------------------------------

def list_designs(db: Session, campaign_id: str) -> list[CampaignDesign]:
    return (
        db.query(CampaignDesign)
        .filter(CampaignDesign.campaign_id == campaign_id)
        .order_by(CampaignDesign.created_at)
        .all()
    )


def get_design(db: Session, design_id: str) -> CampaignDesign | None:
    return db.query(CampaignDesign).filter(CampaignDesign.id == design_id).first()


def create_design(db: Session, campaign_id: str, body: CampaignDesignCreate, user_id: str) -> CampaignDesign:
    design = CampaignDesign(
        id=_uuid.uuid4(),
        campaign_id=campaign_id,
        title=body.title,
        design_type=body.design_type,
        target=body.target,
        target_width_px=body.target_width_px,
        target_height_px=body.target_height_px,
        version_retention=body.version_retention,
        status="draft",
        created_by=user_id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(design)
    return design


def update_design(db: Session, design_id: str, body: CampaignDesignUpdate) -> CampaignDesign | None:
    design = get_design(db, design_id)
    if not design:
        return None
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(design, field, value)
    return design


def duplicate_design(db: Session, design_id: str, user_id: str) -> CampaignDesign | None:
    source = get_design(db, design_id)
    if not source:
        return None
    copy = CampaignDesign(
        id=_uuid.uuid4(),
        campaign_id=source.campaign_id,
        title=f"{source.title} (Copy)",
        design_type=source.design_type,
        target=source.target,
        target_width_px=source.target_width_px,
        target_height_px=source.target_height_px,
        dsl=source.dsl,
        theme=source.theme,
        version_retention=source.version_retention,
        status="draft",
        created_by=user_id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(copy)
    return copy


# ---------------------------------------------------------------------------
# Design Versions
# ---------------------------------------------------------------------------

def create_design_version(
    db: Session,
    design_id: str,
    dsl: dict,
    theme: dict,
    parent_version_id: str | None,
    user_id: str | None,
    edit_summary: str,
) -> CampaignDesignVersion:
    version = CampaignDesignVersion(
        id=_uuid.uuid4(),
        design_id=design_id,
        dsl=dsl,
        theme=theme,
        parent_version_id=parent_version_id,
        created_by=user_id,
        edit_summary=edit_summary,
    )
    db.add(version)
    db.flush()
    _prune_design_versions(db, design_id)
    return version


def _prune_design_versions(db: Session, design_id: str) -> None:
    design = get_design(db, design_id)
    retention = design.version_retention if design else 50
    versions = (
        db.query(CampaignDesignVersion)
        .filter(CampaignDesignVersion.design_id == design_id)
        .order_by(CampaignDesignVersion.created_at.desc())
        .all()
    )
    for old in versions[retention:]:
        db.delete(old)


def list_design_versions(db: Session, design_id: str) -> list[CampaignDesignVersion]:
    return (
        db.query(CampaignDesignVersion)
        .filter(CampaignDesignVersion.design_id == design_id)
        .order_by(CampaignDesignVersion.created_at.desc())
        .all()
    )


def restore_design_version(
    db: Session, design_id: str, version_id: str, user_id: str
) -> CampaignDesignVersion | None:
    version = db.query(CampaignDesignVersion).filter(CampaignDesignVersion.id == version_id).first()
    if not version:
        return None
    design = get_design(db, design_id)
    if not design:
        return None
    new_version = create_design_version(
        db, design_id, version.dsl, version.theme,
        parent_version_id=str(design.current_version_id) if design.current_version_id else None,
        user_id=user_id,
        edit_summary=f"Restored from version {str(version.id)[:8]}",
    )
    import copy
    from sqlalchemy.orm.attributes import flag_modified
    design.dsl = copy.deepcopy(version.dsl)
    design.theme = copy.deepcopy(version.theme)
    design.current_version_id = new_version.id
    flag_modified(design, "dsl")
    flag_modified(design, "theme")
    return new_version


# ---------------------------------------------------------------------------
# Campaign Assets
# ---------------------------------------------------------------------------

def list_assets(db: Session, campaign_id: str) -> list[CampaignAsset]:
    return db.query(CampaignAsset).filter(CampaignAsset.campaign_id == campaign_id).all()


def add_asset(db: Session, campaign_id: str, body: CampaignAssetCreate) -> CampaignAsset:
    asset = CampaignAsset(
        id=_uuid.uuid4(),
        campaign_id=campaign_id,
        asset_library_id=body.asset_library_id,
        kind=body.kind,
        url=body.url,
        alt=body.alt,
        metadata_=body.metadata,
    )
    db.add(asset)
    return asset


def remove_asset(db: Session, asset_id: str) -> bool:
    asset = db.query(CampaignAsset).filter(CampaignAsset.id == asset_id).first()
    if asset:
        db.delete(asset)
        return True
    return False


# ---------------------------------------------------------------------------
# Pamphlet export bridge — one-way Campaign Design → Pamphlet
# ---------------------------------------------------------------------------

def export_design_as_pamphlet(
    db: Session,
    campaign_id: str,
    design_id: str,
    user_id: str,
    pamphlet_title: str | None = None,
    valid_from=None,
    valid_until=None,
) -> "any":
    """Clone a campaign design into app.pamphlets. No link maintained after creation."""
    from api.tools.pamphlets.models import Pamphlet, PamphletItem
    design = get_design(db, design_id)
    if not design:
        return None
    campaign = get_campaign(db, campaign_id)
    title = pamphlet_title or (f"{campaign.title} — {design.title}" if campaign else design.title)

    pamphlet = Pamphlet(
        title=title,
        template_type="sale_offer",
        created_by=user_id,
        created_at=datetime.now(timezone.utc),
        valid_from=valid_from,
        valid_until=valid_until,
        is_published=False,
        template_dsl=design.dsl,
        theme=design.theme,
    )
    db.add(pamphlet)
    db.flush()

    for cp in list_products(db, campaign_id):
        db.add(PamphletItem(
            pamphlet_id=pamphlet.id,
            barcode=cp.barcode,
            display_name=cp.display_name,
            offer_price=cp.offer_price,
            original_price=cp.original_price,
            highlight_text=cp.highlight_text,
            sort_order=cp.sort_order,
            image_url=cp.image_url,
            category=cp.category,
            unit=cp.unit,
        ))

    return pamphlet


# ---------------------------------------------------------------------------
# Chat history
# ---------------------------------------------------------------------------

def load_design_chat_history(db: Session, design_id: str) -> list:
    """Load conversation history for replay into ChatSession."""
    from api.ai.provider import Message
    rows = (
        db.query(CampaignChatMessage)
        .filter(CampaignChatMessage.design_id == design_id)
        .order_by(CampaignChatMessage.created_at)
        .all()
    )
    messages = []
    for row in rows:
        if row.role == "user" and row.content:
            messages.append(Message(role="user", content=row.content))
        elif row.role == "assistant":
            messages.append(Message(role="assistant", content=row.content or ""))
    return messages


def clear_design_chat_history(db: Session, design_id: str) -> int:
    """Delete all chat messages for a design. Returns count deleted."""
    deleted = (
        db.query(CampaignChatMessage)
        .filter(CampaignChatMessage.design_id == design_id)
        .delete(synchronize_session=False)
    )
    db.commit()
    return deleted


def save_design_chat_messages(
    db: Session,
    design_id: str,
    messages: list,
    version_id,
    user_id,
    provider: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    cost_usd: float,
) -> None:
    for msg in messages:
        if msg.role == "user" and not msg.tool_results and msg.content:
            db.add(CampaignChatMessage(
                id=_uuid.uuid4(), design_id=design_id,
                role="user", content=msg.content,
                user_id=user_id,
            ))
        elif msg.role == "assistant":
            db.add(CampaignChatMessage(
                id=_uuid.uuid4(), design_id=design_id,
                role="assistant", content=msg.content or "",
                version_id=version_id,
                provider=provider, model=model,
                prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
                cost_usd=cost_usd,
            ))
        elif msg.role == "user" and msg.tool_results:
            for tr in msg.tool_results:
                db.add(CampaignChatMessage(
                    id=_uuid.uuid4(), design_id=design_id,
                    role="tool", tool_call_name=tr.name,
                    tool_call_result=tr.result if isinstance(tr.result, dict) else {"value": str(tr.result)},
                    version_id=version_id,
                ))
