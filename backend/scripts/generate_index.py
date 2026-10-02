import os
import json
import time
from pathlib import Path
from collections import Counter, defaultdict
import sys

# Ensure backend directory is in python path
current_dir = Path(__file__).resolve().parent
backend_dir = current_dir.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from parsers.markdown_parser import parse_markdown_file, REGISTERED_TOPICS


def generate_index():
    print("==================================================")
    print("SLACKR - Generating Questions Index & Asset Manifest")
    print("PelNETS Hierarchy: Year -> Season -> Paper -> Q#")
    print("==================================================")
    start_time = time.time()
    
    vault_dir = backend_dir / "data" / "pelnets"
    if not vault_dir.exists():
        print(f"Error: Pelnets vault directory not found at {vault_dir}")
        sys.exit(1)

    parsed_list = []
    topic_counts = Counter()
    year_counts = Counter()
    sessions_map = defaultdict(lambda: {
        "session_id": "",
        "session_title": "",
        "season_title": "",
        "year": "",
        "season": "",
        "paper": "",
        "question_count": 0,
        "first_q": 9999,
        "last_q": 0
    })
    topic_subdeck_counts = defaultdict(lambda: defaultdict(int))
    image_based_count = 0
    total_images_referenced = set()
    skipped_count = 0

    # Walk through year directories 2007 through 2026
    year_dirs = sorted([d for d in vault_dir.iterdir() if d.is_dir() and d.name.startswith("20")])
    print(f"Found {len(year_dirs)} year folders in {vault_dir}")

    for y_dir in year_dirs:
        for md_file in y_dir.rglob("*.md"):
            q_data = parse_markdown_file(md_file)
            if q_data:
                parsed_list.append(q_data)
                year_counts[q_data["year"]] += 1
                for topic in q_data["topics"]:
                    topic_counts[topic] += 1
                    topic_subdeck_counts[topic][q_data["year"]] += 1

                # Track session metadata
                sess_id = q_data["session_id"]
                s_entry = sessions_map[sess_id]
                s_entry["session_id"] = sess_id
                s_entry["session_title"] = q_data["session_title"]
                s_entry["season_title"] = q_data["season_title"]
                s_entry["year"] = q_data["year"]
                s_entry["season"] = q_data["season"]
                s_entry["paper"] = q_data["paper"]
                s_entry["question_count"] += 1
                q_num = q_data["number"]
                if q_num > 0:
                    s_entry["first_q"] = min(s_entry["first_q"], q_num)
                    s_entry["last_q"] = max(s_entry["last_q"], q_num)

                if q_data["is_image_based"]:
                    image_based_count += 1
                for img in q_data.get("all_images", []):
                    img_name = img.split("/")[-1]
                    total_images_referenced.add(img_name)
            else:
                skipped_count += 1
                print(f"Warning: Failed to parse {md_file.name}")

    total_questions = len(parsed_list)
    print(f"\nSuccessfully parsed {total_questions} questions!")
    print(f"Image-first questions: {image_based_count} ({image_based_count / total_questions * 100:.1f}%)")
    print(f"Unique images referenced: {len(total_images_referenced)}")

    # Sort all questions strictly by:
    # Year (descending) -> sort_index (Season -> Paper -> Number -> Subnumber)
    parsed_list.sort(key=lambda q: (-int(q["year"]) if q["year"].isdigit() else 0, q["sort_index"]))

    # Convert to indexed dictionary
    questions = {q["id"]: q for q in parsed_list}

    # Format sessions grouped by year
    sessions_by_year = defaultdict(list)
    for sess_id, s_data in sessions_map.items():
        if s_data["first_q"] == 9999:
            s_data["first_q"] = 1
        sessions_by_year[s_data["year"]].append(s_data)

    # Sort sessions within each year: Spring before Autumn, FE-A/AM before FE-B/PM
    for y in sessions_by_year:
        sessions_by_year[y].sort(
            key=lambda s: (0 if s["season"] == "S" else 1, 0 if s["paper"] in ("FE-A", "AM") else 1)
        )

    # Format topic subdecks
    topic_subdecks = {}
    for top in REGISTERED_TOPICS:
        sub_list = []
        for y, count in topic_subdeck_counts[top].items():
            sub_list.append({
                "year": y,
                "subdeck": f"{top}/{y}",
                "count": count
            })
        sub_list.sort(key=lambda s: -int(s["year"]) if s["year"].isdigit() else 0)
        topic_subdecks[top] = sub_list

    # Output paths
    backend_data_dir = backend_dir / "data"
    frontend_public_data_dir = backend_dir.parent / "frontend" / "public" / "data"
    frontend_public_dir = backend_dir.parent / "frontend" / "public"

    backend_data_dir.mkdir(parents=True, exist_ok=True)
    frontend_public_data_dir.mkdir(parents=True, exist_ok=True)
    frontend_public_dir.mkdir(parents=True, exist_ok=True)

    # 1. Save questions_index.json
    backend_index_path = backend_data_dir / "questions_index.json"
    frontend_index_path = frontend_public_data_dir / "questions_index.json"

    print(f"Writing {backend_index_path}...")
    with open(backend_index_path, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    print(f"Writing {frontend_index_path} (for zero-backend offline mode)...")
    with open(frontend_index_path, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False)

    # 2. Save image manifest
    files_dir = vault_dir / "Files"
    existing_images = []
    if files_dir.exists():
        disk_files = {p.name for p in files_dir.iterdir() if p.is_file()}
        for img_name in sorted(list(total_images_referenced)):
            existing_images.append(f"/files/{img_name}")
    else:
        existing_images = [f"/files/{img}" for img in sorted(list(total_images_referenced))]

    manifest_payload = {
        "total_images": len(existing_images),
        "images": existing_images
    }

    backend_img_path = backend_data_dir / "image_list.json"
    frontend_img_path = frontend_public_dir / "image-list.json"

    with open(backend_img_path, "w", encoding="utf-8") as f:
        json.dump(manifest_payload, f, indent=2)
    with open(frontend_img_path, "w", encoding="utf-8") as f:
        json.dump(manifest_payload, f)

    # 3. Save comprehensive metadata summary
    summary_payload = {
        "total_questions": total_questions,
        "years": sorted(list(year_counts.keys()), reverse=True),
        "year_counts": dict(year_counts),
        "sessions_by_year": dict(sessions_by_year),
        "topics": sorted(list(topic_counts.keys())),
        "topic_counts": dict(topic_counts),
        "topic_subdecks": topic_subdecks,
        "registered_topics": REGISTERED_TOPICS
    }
    
    with open(backend_data_dir / "metadata_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary_payload, f, indent=2)
    with open(frontend_public_data_dir / "metadata_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary_payload, f)

    elapsed = time.time() - start_time
    print(f"\nDone in {elapsed:.2f} seconds!")
    print(f"Indexed {total_questions} questions across {len(year_counts)} years and {len(topic_counts)} topics.")
    print("==================================================")


if __name__ == "__main__":
    generate_index()
