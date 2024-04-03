import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { FrameDataType } from 'src/__types/frame_data';
import { promisify } from 'util';

@Injectable()
export class FramedataService {
  private readonly logger = new Logger();

  async getCharacterFrameData(
    characterCode: string,
    game: string,
  ): Promise<FrameDataType[]> {
    if (!characterCode) {
      this.logger.error(`No character name given.`);
      throw new BadRequestException(`Invalid character name.`);
    }

    if (!game) {
      this.logger.error(`No game name given.`);
      throw new BadRequestException(`Invalid game name.`);
    }

    const filePath = `src/__data/${game}/${characterCode}.json`;

    try {
      const readFileAsync = promisify(fs.readFile);
      const data = await readFileAsync(filePath, 'utf8');
      const jsonData = JSON.parse(data);
      return jsonData;
    } catch (error) {
      this.logger.error(
        `An error occurred when reading ${filePath}. ${error.code}: ${error.message}`,
      );
      throw new BadRequestException(
        `No framedata was found for the given character and game combo.`,
      );
    }
  }

  async getSingleMoveFrameData(
    character: string,
    game: string,
    notation: string,
  ) {
    this.logger.log(
      `Attempting to find attack: ${notation} for character: ${character} in ${game}.`,
    );

    const frameData = await this.getCharacterFrameData(character, game);
    let attackInfo: FrameDataType[] = frameData.filter((item) =>
      item.alternateInputs.includes(
        notation.replaceAll(/[\u200B-\u200D\uFEFF]/g, ''),
      ),
    );

    const similarityMap: { move: FrameDataType; similarity: number }[] = [];
    for (let i = 0; i < 2; i++) {
      if (!!attackInfo[0]) {
        break;
      }
      this.logger.log(`Formatting notation, iteration: ${i}`);
      const removePlus = i > 0;
      const formattedNotation = this.formatNotation(notation, removePlus);

      for (let y = 0; y < frameData.length; y++) {
        const moveData = frameData[y];
        moveData.alternateInputs.forEach((input) => {
          if (this.formatNotation(input, removePlus) === formattedNotation) {
            attackInfo.push(moveData);
          }
          const similarity = this.calculateSimilarity(input, notation);
          similarityMap.push({ move: moveData, similarity });
        });
      }
    }
    if (!attackInfo[0]) {
      for (let i = 0; i < frameData.length; i++) {
        const moveData = frameData[i];
        moveData.alternateInputs.forEach((input) => {});
      }

      similarityMap.sort((a, b) => b.similarity - a.similarity);
      const top5Moves = similarityMap.slice(0, 5).map((entry) => entry.move);
      const uniqueSimilarMoves = top5Moves.filter(this.onlyUnique);

      if (uniqueSimilarMoves.length === 0) {
        throw new BadRequestException(`No data found for the given attack.`);
      }

      this.logger.error(
        `Couldn't find attack: ${notation}. Returning 5 most similar ones.`,
      );
      return uniqueSimilarMoves;
    }
    this.logger.log(`Found attack: ${attackInfo[0].input}`);
    return attackInfo[0];
  }

  private onlyUnique(value, index, array) {
    return array.indexOf(value) === index;
  }

  private calculateSimilarity(input1: string, input2: string): number {
    const set1 = new Set(input1.split(''));
    const set2 = new Set(input2.split(''));
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
  }

  private formatNotation(inputNotation: string, removePlus: boolean): string {
    let modifiedNotation = inputNotation;
    if (!modifiedNotation.includes('fc')) {
      modifiedNotation = modifiedNotation.replaceAll('cd', 'f,n,d,df');
    }
    modifiedNotation = modifiedNotation
      .toLowerCase()

      // TODO: This is kinda stupid, maybe move the input shortcuts to a different function
      .replaceAll('debug', 'b,db,d,df')
      .replaceAll('gs', 'f,n,b,db,d,df,f')
      .replaceAll('wr', 'f,f,f')
      .replaceAll('qcf', 'd,df,f')
      .replaceAll('qcb', 'd,db,b')
      .replaceAll('hcf', 'b,db,f,df,f')
      .replaceAll('hcb', 'f,df,d,db,d')
      .replaceAll('ewgf', 'f,n,d,df:2')
      .replaceAll('heatsmash', 'in heat 2+3')
      .replaceAll('heatburst', '2+3')
      .replaceAll('#', ':')
      .replaceAll('.', '')
      .replaceAll(/ *\([^)]*\) */g, '')
      .replaceAll(/[\u200B-\u200D\uFEFF]/g, '')
      .split('or')
      .pop()
      .replace(/[\s,/()]/g, '');

    if (removePlus) {
      modifiedNotation = modifiedNotation.replaceAll(/\+/g, '');
    }

    return modifiedNotation;
  }
}
