$ErrorActionPreference = "Stop"

function Get-UpscaledArtworkUrl {
    param([string]$Url)

    if ([string]::IsNullOrWhiteSpace($Url)) {
        return $null
    }

    return ($Url -replace "60x60bb", "1200x1200bb" `
                 -replace "100x100bb", "1200x1200bb" `
                 -replace "200x200bb", "1200x1200bb" `
                 -replace "600x600bb", "1200x1200bb" `
                 -replace "60x60", "1200x1200bb" `
                 -replace "100x100", "1200x1200bb" `
                 -replace "200x200", "1200x1200bb" `
                 -replace "600x600", "1200x1200bb")
}

function Get-ItunesArtworkUrl {
    param(
        [string]$Query,
        [string]$Entity,
        [string]$Attribute,
        [int]$Limit = 1
    )

    if ([string]::IsNullOrWhiteSpace($Query)) {
        return $null
    }

    $params = @{
        term = $Query
        entity = $Entity
        limit = $Limit
    }

    if (-not [string]::IsNullOrWhiteSpace($Attribute)) {
        $params.attribute = $Attribute
    }

    try {
        $resp = Invoke-RestMethod -Method Get -Uri "https://itunes.apple.com/search" -Body $params
    }
    catch {
        return $null
    }

    if (-not $resp.results -or $resp.results.Count -eq 0) {
        return $null
    }

    return (Get-UpscaledArtworkUrl -Url $resp.results[0].artworkUrl100)
}

function Get-FirstNonEmptyArtworkUrl {
    param([string[]]$Candidates)

    foreach ($candidate in $Candidates) {
        if (-not [string]::IsNullOrWhiteSpace($candidate)) {
            return $candidate
        }
    }

    return $null
}

function Get-ArtistQueryCandidates {
    param([string]$ArtistName)

    $candidates = @($ArtistName)

    $candidates += ($ArtistName -replace ";.*$", "")
    $candidates += ($ArtistName -replace ",.*$", "")
    $candidates += ($ArtistName -replace "\s+feat\..*$", "")
    $candidates += ($ArtistName -replace "\s+ft\..*$", "")
    $candidates += ($ArtistName -replace "\s*&.*$", "")
    $candidates += ($ArtistName -replace "\s+x\s+.*$", "")

    return $candidates |
        ForEach-Object { $_.Trim() } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        Select-Object -Unique
}

function Query-DbRows {
    param([string]$Sql)

    return docker exec music-postgres psql -U music -d music -At -F "|" -c $Sql
}

function Exec-DbSql {
    param([string]$Sql)

    docker exec music-postgres psql -U music -d music -c $Sql | Out-Null
}

$artistRows = Query-DbRows -Sql "SELECT id, name FROM artists WHERE COALESCE(btrim(image_url), '') = '';"
$artistUpdated = 0

foreach ($row in $artistRows) {
    if ([string]::IsNullOrWhiteSpace($row)) {
        continue
    }

    $parts = $row -split "\|", 2
    if ($parts.Count -lt 2) {
        continue
    }

    $artistId = $parts[0].Trim()
    $artistName = $parts[1].Trim()

    if ([string]::IsNullOrWhiteSpace($artistName)) {
        continue
    }

    $imageUrl = $null
    foreach ($artistQuery in (Get-ArtistQueryCandidates -ArtistName $artistName)) {
        $imageUrl = Get-FirstNonEmptyArtworkUrl -Candidates @(
            (Get-ItunesArtworkUrl -Query $artistQuery -Entity "album" -Attribute "artistTerm" -Limit 1),
            (Get-ItunesArtworkUrl -Query $artistQuery -Entity "song" -Attribute "artistTerm" -Limit 1)
        )

        if (-not [string]::IsNullOrWhiteSpace($imageUrl)) {
            break
        }
    }
    if ([string]::IsNullOrWhiteSpace($imageUrl)) {
        continue
    }

    $safeUrl = $imageUrl.Replace("'", "''")
    Exec-DbSql -Sql "UPDATE artists SET image_url = '$safeUrl', updated_at = NOW() WHERE id = '$artistId'::uuid AND COALESCE(btrim(image_url), '') = '';"
    $artistUpdated++
}

$albumRows = Query-DbRows -Sql "SELECT a.id, a.title, ar.name FROM albums a JOIN artists ar ON ar.id = a.artist_id WHERE COALESCE(btrim(a.artwork_url), '') = '';"
$albumUpdated = 0

foreach ($row in $albumRows) {
    if ([string]::IsNullOrWhiteSpace($row)) {
        continue
    }

    $parts = $row -split "\|", 3
    if ($parts.Count -lt 3) {
        continue
    }

    $albumId = $parts[0].Trim()
    $albumTitle = $parts[1].Trim()
    $artistName = $parts[2].Trim()

    $query = "$artistName $albumTitle".Trim()
    if ([string]::IsNullOrWhiteSpace($query)) {
        continue
    }

    $artworkUrl = Get-FirstNonEmptyArtworkUrl -Candidates @(
        (Get-ItunesArtworkUrl -Query $query -Entity "song" -Attribute "" -Limit 1),
        (Get-ItunesArtworkUrl -Query $query -Entity "album" -Attribute "" -Limit 1),
        (Get-ItunesArtworkUrl -Query $albumTitle -Entity "album" -Attribute "albumTerm" -Limit 1)
    )
    if ([string]::IsNullOrWhiteSpace($artworkUrl)) {
        continue
    }

    $safeUrl = $artworkUrl.Replace("'", "''")
    Exec-DbSql -Sql "UPDATE albums SET artwork_url = '$safeUrl', updated_at = NOW() WHERE id = '$albumId'::uuid AND COALESCE(btrim(artwork_url), '') = '';"
    $albumUpdated++
}

Write-Output "ARTISTS_UPDATED=$artistUpdated"
Write-Output "ALBUMS_UPDATED=$albumUpdated"

Exec-DbSql -Sql @"
UPDATE artists ar
SET image_url = src.artwork_url,
        updated_at = NOW()
FROM (
        SELECT a.artist_id AS artist_id, MAX(a.artwork_url) AS artwork_url
        FROM albums a
        WHERE COALESCE(btrim(a.artwork_url), '') <> ''
        GROUP BY a.artist_id
) src
WHERE ar.id = src.artist_id
    AND COALESCE(btrim(ar.image_url), '') = ''
    AND COALESCE(btrim(src.artwork_url), '') <> '';
"@

$counts = Query-DbRows -Sql "SELECT COUNT(*) FROM artists WHERE COALESCE(btrim(image_url), '') <> '';"
$albumCounts = Query-DbRows -Sql "SELECT COUNT(*) FROM albums WHERE COALESCE(btrim(artwork_url), '') <> '';"

Write-Output "ARTISTS_WITH_IMAGE=$counts"
Write-Output "ALBUMS_WITH_ARTWORK=$albumCounts"
