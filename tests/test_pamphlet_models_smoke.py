from api.tools.pamphlets.models import Pamphlet, PamphletVersion, PamphletChatMessage


def test_models_have_expected_columns():
    assert "template_dsl" in Pamphlet.__table__.columns
    assert "theme" in Pamphlet.__table__.columns
    assert "current_version_id" in Pamphlet.__table__.columns
    assert PamphletVersion.__tablename__ == "pamphlet_versions"
    assert PamphletChatMessage.__tablename__ == "pamphlet_chat_messages"
    assert "cost_usd" in PamphletChatMessage.__table__.columns
